# Re-embed Documents Script for DocSense
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

$documentsQuery = @"
SELECT id, filename FROM documents WHERE status = 'ready' ORDER BY created_at DESC;
"@

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
    $docId = $parts[0]
    $filename = $parts[1]
    
    Write-Host "`n📖 Processing: $filename" -ForegroundColor White
    Write-Host "   Doc ID: $docId" -ForegroundColor Gray
    
    # Get chunks for this document
    $chunksQuery = @"
SELECT id, chunk_index, content_text FROM document_chunks WHERE document_id = '$docId' ORDER BY chunk_index;
"@
    
    $chunksResult = docker exec docsense-postgres psql -U docsense -d docsense -t -A -F '|' -c $chunksQuery
    
    if (!$chunksResult) {
        Write-Host "   ⚠️  No chunks found for this document" -ForegroundColor Yellow
        continue
    }
    
    $chunks = $chunksResult -split "`n" | Where-Object { $_.Trim() -ne "" }
    Write-Host "   📦 Found $($chunks.Count) chunks" -ForegroundColor Cyan
    
    # Build chunks array for API
    $chunkArray = @()
    foreach ($chunkLine in $chunks) {
        # Split on first two pipes only, as content might contain pipes
        $chunkParts = $chunkLine -split '\|', 3
        if ($chunkParts.Count -ge 3) {
            $chunkId = $chunkParts[0]
            $chunkIndex = [int]$chunkParts[1]
            $text = $chunkParts[2]
            
            $chunkArray += @{
                chunk_id = $chunkId
                chunk_index = $chunkIndex
                text = $text
            }
        }
    }
    
    if ($chunkArray.Count -eq 0) {
        Write-Host "   ⚠️  No valid chunks to embed" -ForegroundColor Yellow
        continue
    }
    
    # Send to RAG service
    Write-Host "   🔄 Embedding $($chunkArray.Count) chunks..." -ForegroundColor Cyan
    
    $payload = @{
        document_id = $docId
        chunks = $chunkArray
    } | ConvertTo-Json -Depth 10
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8000/embed" `
            -Method POST `
            -Body $payload `
            -ContentType "application/json" `
            -TimeoutSec 60
        
        $upserted = $response.upserted
        Write-Host "   ✅ Embedded $upserted chunks successfully" -ForegroundColor Green
        $successCount++
        
    } catch {
        Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails) {
            Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
    }
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
        Write-Host "`n🎉 Success! Documents are now searchable.`n" -ForegroundColor Green
        Write-Host "💡 Try these queries in the UI:" -ForegroundColor Yellow
        Write-Host "   • 'What is the attention mechanism?'"
        Write-Host "   • 'Explain the transformer architecture'"  
        Write-Host "   • 'Compare the AI design approach in both documents'"
        Write-Host "   • 'What are the key innovations in the attention paper?'"
        Write-Host "`n🤖 Switch to Agent mode for complex comparisons!" -ForegroundColor Magenta
    } else {
        Write-Host "`n⚠️  No vectors found in Qdrant. Check RAG service logs:" -ForegroundColor Yellow
        Write-Host "   docker compose logs rag --tail 20"
    }
    
} catch {
    Write-Host "`n⚠️  Could not verify Qdrant vectors: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
