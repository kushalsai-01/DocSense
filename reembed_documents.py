#!/usr/bin/env python3
"""
Re-embed existing documents into Qdrant vector database.
Run this when documents were uploaded but not embedded.
"""

import requests
import psycopg2
import sys

# Configuration
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'docsense',
    'user': 'docsense',
    'password': 'docsense'
}
RAG_URL = 'http://localhost:8000'

def get_documents_with_chunks():
    """Fetch all documents and their chunks from PostgreSQL."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # Get all documents
    cur.execute("""
        SELECT id, filename, status 
        FROM documents 
        WHERE status = 'ready'
        ORDER BY created_at DESC
    """)
    documents = cur.fetchall()
    
    print(f"📄 Found {len(documents)} ready documents")
    
    doc_chunks = []
    for doc_id, filename, status in documents:
        print(f"\n📖 Processing: {filename}")
        print(f"   Doc ID: {doc_id}")
        
        # Get chunks for this document
        cur.execute("""
            SELECT id, chunk_index, content 
            FROM document_chunks 
            WHERE document_id = %s 
            ORDER BY chunk_index
        """, (doc_id,))
        chunks = cur.fetchall()
        
        print(f"   📦 Found {len(chunks)} chunks")
        
        if chunks:
            doc_chunks.append({
                'document_id': doc_id,
                'filename': filename,
                'chunks': [
                    {
                        'chunk_id': chunk_id,
                        'chunk_index': chunk_index,
                        'text': content
                    }
                    for chunk_id, chunk_index, content in chunks
                ]
            })
    
    cur.close()
    conn.close()
    
    return doc_chunks

def embed_document(doc_data):
    """Send document chunks to RAG service for embedding."""
    doc_id = doc_data['document_id']
    filename = doc_data['filename']
    chunks = doc_data['chunks']
    
    print(f"\n🔄 Embedding {filename}...")
    
    # Call RAG /embed endpoint
    payload = {
        'document_id': doc_id,
        'chunks': chunks
    }
    
    try:
        response = requests.post(f'{RAG_URL}/embed', json=payload, timeout=60)
        response.raise_for_status()
        
        result = response.json()
        upserted = result.get('upserted', 0)
        
        print(f"   ✅ Embedded {upserted} chunks successfully")
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   Response: {e.response.text}")
        return False

def verify_embeddings():
    """Verify embeddings in Qdrant."""
    try:
        response = requests.post(
            'http://localhost:6333/collections/documents/points/count',
            json={'exact': True},
            headers={'Content-Type': 'application/json'}
        )
        response.raise_for_status()
        count = response.json()['result']['count']
        print(f"\n✅ Total vectors in Qdrant: {count}")
        return count
    except Exception as e:
        print(f"\n❌ Error checking Qdrant: {e}")
        return 0

def main():
    print("🚀 DocSense - Re-embedding Script")
    print("=" * 50)
    
    # Check services
    print("\n🔍 Checking services...")
    try:
        requests.get(f'{RAG_URL}/health', timeout=5)
        print("   ✅ RAG service is running")
    except:
        print("   ❌ RAG service is not accessible")
        sys.exit(1)
    
    try:
        response = requests.get('http://localhost:6333/collections', timeout=5)
        print("   ✅ Qdrant is running")
    except:
        print("   ❌ Qdrant is not accessible")
        sys.exit(1)
    
    # Get documents
    print("\n📚 Fetching documents from database...")
    doc_chunks = get_documents_with_chunks()
    
    if not doc_chunks:
        print("\n⚠️  No documents found to embed")
        return
    
    # Embed each document
    print(f"\n🔄 Starting embedding process for {len(doc_chunks)} documents...")
    success_count = 0
    
    for doc_data in doc_chunks:
        if embed_document(doc_data):
            success_count += 1
    
    # Verify
    print("\n" + "=" * 50)
    print(f"📊 Results: {success_count}/{len(doc_chunks)} documents embedded")
    vector_count = verify_embeddings()
    
    if vector_count > 0:
        print("\n🎉 Success! Documents are now searchable.")
        print("\n💡 Try these queries:")
        print("   • 'What is the attention mechanism?'")
        print("   • 'Explain the transformer architecture'")
        print("   • 'Compare the AI design approach in both documents'")
    else:
        print("\n⚠️  No vectors found in Qdrant. Check RAG service logs.")

if __name__ == '__main__':
    main()
