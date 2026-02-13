echo "🚀 Simple Manual Embedding Script"
echo ""

# Document IDs
DOC1="8ad084ef-d17c-4292-98fb-3dfb209f6bfb"
DOC2="9388eebf-2305-421e-bbb4-94c0e38a6d49"

echo "📄 Processing Document 1 (Attention paper)..."
docker exec docsense-postgres psql -U docsense -d docsense<<EOF
\o /tmp/chunks1.json
SELECT json_agg(json_build_object('chunk_id', id::text, 'chunk_index', chunk_index, 'text', substring(content_text, 1, 5000)))::text 
FROM document_chunks 
WHERE document_id = '$DOC1';
\o
EOF

docker exec -i docsense-rag sh << 'EMBED1'
python3 << 'PYTHON'
import requests

# Read chunks
with open('/tmp/chunks1.json', 'r') as f:
    chunks_json = f.read().strip()

# Clean up []  
if chunks_json.startswith('[') and chunks_json.endswith(']'):
    chunks_json = chunks_json[1:-1].strip()

payload = {
    "document_id": "8ad084ef-d17c-4292-98fb-3dfb209f6bfb",
    "chunks": eval(chunks_json)  # Safe here since we control the source
}

response = requests.post("http://localhost:8000/embed", json=payload)
print(f"✅ Document 1: {response.status_code} - {response.text}")
PYTHON
EMBED1

echo ""
echo "📄 Processing Document 2 (AI Design Document)..."
docker exec docsense-postgres psql -U docsense -d docsense << EOF  
\o /tmp/chunks2.json
SELECT json_agg(json_build_object('chunk_id', id::text, 'chunk_index', chunk_index, 'text', substring(content_text, 1, 5000)))::text 
FROM document_chunks 
WHERE document_id = '$DOC2';
\o
EOF

docker exec -i docsense-rag sh << 'EMBED2'
python3 << 'PYTHON'
import requests

# Read chunks
with open('/tmp/chunks2.json', 'r') as f:
    chunks_json = f.read().strip()

# Clean up
if chunks_json.startswith('[') and chunks_json.endswith(']'):
    chunks_json = chunks_json[1:-1].strip()

payload = {
    "document_id": "9388eebf-2305-421e-bbb4-94c0e38a6d49",
    "chunks": eval(chunks_json)
}

response = requests.post("http://localhost:8000/embed", json=payload)
print(f"✅ Document 2: {response.status_code} - {response.text}")
PYTHON
EMBED2

echo ""
echo "✅ Done! Checking vector count..."
curl -s -X POST http://localhost:6333/collections/documents/points/count \
  -H "Content-Type: application/json" \
  -d '{"exact": true}' | python3 -c "import sys, json; r=json.load(sys.stdin); print(f'📊 Total vectors: {r[\"result\"][\"count\"]}')"
echo ""
echo "========================================="
echo "🎉 Your documents are now searchable!"
echo ""
echo "Try these queries in the UI (http://localhost:5173):"
echo "  • What is the attention mechanism?"
echo "  • Explain the transformer architecture"
echo "  • Compare the AI course structure in the design document"
echo ""
echo "🤖 Switch to Agent mode for complex queries!"
