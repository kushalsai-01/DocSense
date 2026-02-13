# Re-embed Documents Script for DocSense (Fixed Version)
# Fetches documents from PostgreSQL and sends them to RAG service for embedding

Write-Host "🚀 DocSense - Re-embedding Script" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# Check if services are running
Write-Host "`n🔍 Checking services..." -ForegroundColor Yellow

try {
    $null = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 5
    Write-Host "   ✅ RAG service is running" -ForegroundColor Green
} catch {
    Write-Host "   ❌ RAG service is not accessible" -ForegroundColor Red
    exit 1
}

try {
    $null = Invoke-RestMethod -Uri "http://localhost:6333/collections" -TimeoutSec 5
    Write-Host "   ✅ Qdrant is running" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Qdrant is not accessible" -ForegroundColor Red
    exit 1
}

# Get documents from PostgreSQL
Write-Host "`n📚 Fetching documents from database..." -ForegroundColor Yellow

$documentsQuery = "SELECT id, filename FROM documents WHERE status = 'ready' ORDER BY created_at DESC;"
$documentsResult = docker exec docsense-postgres psql -U docsense -d docsense -t -A -F '|' -c $documentsQuery

if (!$documentsResult) {
    Write-Host "   ⚠️  No ready documents found" -ForegroundColor Yellow
    exit 0
}

$documents = $documentsResult -split "`n" | Where-Object { $_.Trim() -ne "" }
Write-Host "   📄 Found $($documents.Count) ready documents" -ForegroundColor Cyan

$successCount = 0
$totalDocs = $documents.Count

foreach ($docLine in $documents) {
    $parts = $docLine -split '\|'
    $docId = $parts[0].Trim()
    $filename = $parts[1].Trim()
    
    Write-Host "`n📖 Processing: $filename" -ForegroundColor White
    Write-Host "   Doc ID: $docId" -ForegroundColor Gray
    
    # Get chunks as JSON to avoid delimiter issues
    $chunksQuery = @"
SELECT json_agg(t.* ORDER BY t.chunk_index)::text 
FROM (
    SELECT id::text as chunk_id, chunk_index, content_text as text
    FROM document_chunks 
    WHERE document_id = '$docId'
) t;
"@
    
    $chunksJson = docker exec docsense-postgres psql -U docsense -d docsense -t -A -c $chunksQuery
    
    if (!$chunksJson -or $chunksJson.Trim() -eq "" -or $chunksJson.Trim() -eq "null") {
        Write-Host "   ⚠️  No chunks found for this document" -ForegroundColor Yellow
        continue
    }
    
    # Parse JSON
    try {
        $chunks = $chunksJson | ConvertFrom-Json
        Write-Host "   📦 Found $($chunks.Count) chunks" -ForegroundColor Cyan
    } catch {
        Write-Host "   ❌ Error parsing chunks: $_" -ForegroundColor Red
        continue
    }
    
    if ($chunks.Count -eq 0) {
        Write-Host "   ⚠️  No valid chunks to embed" -ForegroundColor Yellow
        continue
    }
    
    # Send to RAG service
    Write-Host "   🔄 Embedding $($chunks.Count) chunks..." -ForegroundColor Cyan
    
    $payload = @{
        document_id = $docId
        chunks = $chunks
    } | ConvertTo-Json -Depth 10 -Compress
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8000/embed" `
            -Method POST `
            -Body $payload `
            -ContentType "application/json; charset=utf-8" `
            -TimeoutSec 120
        
        $upserted = $response.upserted
        Write-Host "   ✅ Embedded $upserted chunks successfully" -ForegroundColor Green
        $successCount++
        
    } catch {
        Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails) {
            Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
    }
    
    # Small delay between documents
    Start-Sleep -Milliseconds 500
}

# Verify embeddings in Qdrant
Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
Write-Host "📊 Results: $successCount/$totalDocs documents embedded" -ForegroundColor White

try {
    $countResponse = Invoke-RestMethod -Uri "http://localhost:6333/collections/documents/points/count" `
        -Method POST `
        -Body '{"exact": true}' `
        -ContentType "application/json"
    
    $vectorCount = $countResponse.result.count
    Write-Host "`n✅ Total vectors in Qdrant: $vectorCount" -ForegroundColor Green
    
    if ($vectorCount -gt 0) {
        Write-Host "`n🎉 SUCCESS! Your documents are now searchable!`n" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        Write-Host "`n💡 TEST QUESTIONS (try in the UI):`n" -ForegroundColor Yellow
        
        Write-Host "📝 Simple RAG Mode (fast):" -ForegroundColor White
        Write-Host "   • What is the attention mechanism?"
        Write-Host "   • Explain the transformer architecture"
        Write-Host "   • What are the key components of the AI design?"
        
        Write-Host "`n🤖 Agent Mode (comprehensive):" -ForegroundColor Magenta
        Write-Host "   • Compare the attention mechanism approach in both documents"
        Write-Host "   • What are the main differences between the transformer design and the AI system design?"
        Write-Host "   • Summarize the key innovations from both papers"
        Write-Host "   • How does multi-head attention work and where is it applied?"
        
        Write-Host "`n🎯 HOW TO TEST:" -ForegroundColor Cyan
        Write-Host "   1. Go to http://localhost:5173"
        Write-Host "   2. Click the purple [Agent] button"
        Write-Host "   3. Ask: 'Compare both documents and explain the differences'"
        Write-Host "   4. Watch the agent analyze, plan, and synthesize!"
        
        Write-Host "`n✨ The agent will:" -ForegroundColor Green
        Write-Host "   → Analyze your question complexity"
        Write-Host "   → Choose the best strategy"
        Write-Host "   → Execute multiple searches"
        Write-Host "   → Synthesize comprehensive answer"
        Write-Host "   → Validate answer quality"
        Write-Host ""
    } else {
        Write-Host "`n⚠️  No vectors found in Qdrant. Check RAG service logs:" -ForegroundColor Yellow
        Write-Host "   docker compose logs rag --tail 20"
    }
    
} catch {
    Write-Host "`n❌ Could not verify Qdrant: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
