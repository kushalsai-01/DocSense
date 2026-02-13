"""
Manual Document Embedding Script
Re-embeds documents from PostgreSQL into Qdrant vector database
"""
import psycopg2
import requests
import json

# Configuration
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'docsense',
    'user': 'docsense',
    'password': 'docsense_dev_password'
}
RAG_URL = 'http://localhost:8000'

def main():
    print("🚀 DocSense - Manual Embedding Script")
    print("=" * 60)
    
    # Connect to PostgreSQL
    print("\n📚 Fetching documents from database...")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    # Get all ready documents
    cur.execute("""
        SELECT id, filename 
        FROM documents 
        WHERE status = 'ready'
        ORDER BY created_at DESC
    """)
    documents = cur.fetchall()
    
    if not documents:
        print("⚠️  No documents found")
        return
    
    print(f"   📄 Found {len(documents)} documents\n")
    
    success_count = 0
    
    for doc_id, filename in documents:
        print(f"📖 Processing: {filename}")
        print(f"   Doc ID: {doc_id}")
        
        # Get chunks
        cur.execute("""
            SELECT id::text, chunk_index, content_text 
            FROM document_chunks 
            WHERE document_id = %s 
            ORDER BY chunk_index
        """, (doc_id,))
        chunks = cur.fetchall()
        
        if not chunks:
            print(f"   ⚠️  No chunks found\n")
            continue
        
        print(f"   📦 Found {len(chunks)} chunks")
        
        # Prepare payload
        chunks_data = [
            {
                'chunk_id': chunk_id,
                'chunk_index': chunk_index,
                'text': text[:10000]  # Limit text size
            }
            for chunk_id, chunk_index, text in chunks
        ]
        
        payload = {
            'document_id': doc_id,
            'chunks': chunks_data
        }
        
        # Send to RAG service
        print(f"   🔄 Embedding {len(chunks_data)} chunks...")
        try:
            response = requests.post(
                f'{RAG_URL}/embed',
                json=payload,
                timeout=120
            )
            response.raise_for_status()
            
            result = response.json()
            upserted = result.get('upserted', 0)
            print(f"   ✅ Embedded {upserted} chunks successfully\n")
            success_count += 1
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"   Response: {e.response.text}\n")
    
    cur.close()
    conn.close()
    
    # Verify
    print("=" * 60)
    print(f"📊 Results: {success_count}/{len(documents)} documents embedded\n")
    
    try:
        response = requests.post(
            'http://localhost:6333/collections/documents/points/count',
            json={'exact': True}
        )
        count = response.json()['result']['count']
        print(f"✅ Total vectors in Qdrant: {count}\n")
        
        if count > 0:
            print("🎉 SUCCESS! Your documents are now searchable!\n")
            print("=" * 60)
            print("\n💡 TEST QUESTIONS:\n")
            print("📝 RAG Mode (simple questions):")
            print("   • What is the attention mechanism?")
            print("   • How long is the AI course?")
            print("   • What topics are in Chapter 5?")
            print("\n🤖 Agent Mode (complex comparisons):")
            print("   • Compare both PDFs")
            print("   • What are the differences between the transformer")
            print("     architecture and the AI course curriculum?")
            print("   • How does the attention paper relate to Chapter 9?")
            print("\n🎯 HOW TO TEST:")
            print("   1. Go to http://localhost:5173")
            print("   2. Click purple [Agent] button for complex queries")
            print("   3. Ask: 'Compare both PDFs'")
            print("   4. Watch the agent analyze and synthesize!\n")
        else:
            print("⚠️  No vectors in Qdrant. Check RAG service logs.")
            
    except Exception as e:
        print(f"❌ Error verifying Qdrant: {e}")

if __name__ == '__main__':
    main()
