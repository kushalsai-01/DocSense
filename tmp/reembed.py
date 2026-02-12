import requests
import psycopg2
import json

# Database connection
conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="docsense",
    user="docsense",
    password="docsense_dev_password"
)

cursor = conn.cursor()

# Get second document chunks
cursor.execute("""
    SELECT id, chunk_index, content_text 
    FROM document_chunks 
    WHERE document_id = '5c59fa9a-f68b-48d1-9556-bc9ee5d5ecb3'
    ORDER BY chunk_index
""")

rows = cursor.fetchall()
chunks = [{"chunk_id": str(row[0]), "chunk_index": row[1], "text": row[2]} for row in rows]

payload = {
    "document_id": "5c59fa9a-f68b-48d1-9556-bc9ee5d5ecb3",
    "chunks": chunks
}

# Send to embed endpoint
response = requests.post("http://localhost:8000/embed", json=payload, timeout=60)
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")

cursor.close()
conn.close()
