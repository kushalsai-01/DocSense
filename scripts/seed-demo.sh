#!/usr/bin/env bash
# DocSense Demo Seed Script
# Creates a demo user and uploads 3 sample documents.
# Run AFTER all services are healthy.
#
# Usage: ./scripts/seed-demo.sh
# Override: API_URL=http://my-server/api ./scripts/seed-demo.sh
set -euo pipefail

API="${API_URL:-http://localhost/api}"

DEMO_EMAIL="demo@docsense.dev"
DEMO_PW="Demo@12345"
DEMO_NAME="Demo User"

# ── Helpers ────────────────────────────────────────────────────────────
green='\033[0;32m'
reset='\033[0m'

ok()  { printf "${green}✅${reset} %s\n" "$1"; }
info(){ printf "   %s\n" "$1"; }

# ── Ensure required tools are available ───────────────────────────────
for tool in curl python3; do
  if ! command -v "$tool" &>/dev/null; then
    echo "ERROR: '$tool' is required but not found in PATH."
    exit 1
  fi
done

json_field() {
  python3 -c "
import sys, json
try:
  d = json.loads(sys.argv[1])
  print($2)
except Exception:
  print('')
" "$1" 2>/dev/null || echo ""
}

echo "🌱 Seeding DocSense demo data…"
info "API: $API"
echo ""

# ── Register demo user ─────────────────────────────────────────────────
REG_BODY=$(curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PW\",\"name\":\"$DEMO_NAME\"}" \
  --max-time 15 2>/dev/null || echo '{}')

REG_USER=$(json_field "$REG_BODY" "str(d.get('user',{}).get('id',''))")
if [ -n "$REG_USER" ]; then
  ok "Demo user created ($DEMO_EMAIL)"
else
  # User may already exist — just log in
  info "User may already exist — attempting login…"
fi

# ── Login ──────────────────────────────────────────────────────────────
LOGIN_BODY=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PW\"}" \
  --max-time 15 2>/dev/null || echo '{}')

TOKEN=$(json_field "$LOGIN_BODY" "d.get('token',d.get('data',{}).get('tokens',{}).get('accessToken',''))")
WS_ID=$(json_field "$LOGIN_BODY" "str(d.get('workspace',{}).get('id','default'))")

if [ -z "$TOKEN" ]; then
  echo "ERROR: Login failed. Is the API running?"
  echo "Response: $LOGIN_BODY"
  exit 1
fi

ok "Logged in as $DEMO_EMAIL (workspace: $WS_ID)"

# ── Upload sample documents ────────────────────────────────────────────
echo ""
echo "Uploading sample documents…"

upload_doc() {
  local path="$1" mime="$2" label="$3"
  local BODY
  BODY=$(curl -s -X POST "$API/workspaces/$WS_ID/documents" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$path;type=$mime" \
    --max-time 30 2>/dev/null || echo '{}')
  local ID
  ID=$(json_field "$BODY" "d.get('documentId',d.get('id',''))")
  if [ -n "$ID" ]; then
    ok "$label (id: $ID)"
    echo "$ID"
  else
    info "WARNING: Upload may have failed for $label"
    echo ""
  fi
}

# Sample 1: AI research paper
cat > /tmp/ds_doc1.txt << 'EOF'
Title: Attention Is All You Need

Abstract: We propose a new simple network architecture, the Transformer, based
solely on attention mechanisms, dispensing with recurrence and convolutions
entirely. Experiments on two machine translation tasks show these models to be
superior in quality while being more parallelizable and requiring significantly
less time to train.

Introduction: Recurrent neural networks have been firmly established as state
of the art approaches in sequence modeling and transduction problems. The
Transformer follows an encoder-decoder structure using stacked self-attention
and point-wise, fully connected layers.

Multi-Head Attention: Instead of performing a single attention function with
dmodel-dimensional keys, values and queries, we found it beneficial to linearly
project the queries, keys and values h times with different learned linear
projections to dk, dk and dv dimensions, respectively.

Results: On the WMT 2014 English-to-German translation task, the big
transformer model outperforms the best previously reported models including
ensembles by more than 2.0 BLEU, establishing a new state-of-the-art BLEU
score of 28.4.

Conclusion: In this work, we presented the Transformer, the first sequence
transduction model based entirely on attention, replacing the recurrent layers
most commonly used in encoder-decoder architectures with multi-headed
self-attention.
EOF

DOC1=$(upload_doc /tmp/ds_doc1.txt text/plain "AI Research Paper (Attention Is All You Need)")

# Sample 2: Financial report
cat > /tmp/ds_doc2.txt << 'EOF'
Q3 2024 Financial Results — TechCorp Inc.

Revenue: Total revenue for Q3 2024 was $2.4 billion, up 18% year-over-year.
Cloud services revenue grew 34% to $1.1 billion, now representing 46% of total
revenue. Enterprise software contributed $0.8 billion (+6% YoY).

Operating Income: Operating income was $480 million, representing a 20%
operating margin, up from 17% in Q3 2023. This improvement was driven by
operational efficiency initiatives and favorable product mix shift toward
higher-margin cloud offerings.

Key Metrics: Monthly active users reached 45 million, up 22% year-over-year.
Enterprise customers grew to 12,400, with average contract value increasing 15%
to $185,000 annually. Net Revenue Retention remained strong at 118%.

Guidance: For Q4 2024, we expect total revenue between $2.55 billion and $2.65
billion. Full year 2024 revenue guidance raised to $9.6–$9.8 billion.

Risk Factors: Increased competition in cloud services, macroeconomic headwinds
affecting customer spending, and currency headwinds from a stronger US dollar.
EOF

DOC2=$(upload_doc /tmp/ds_doc2.txt text/plain "Financial Report (TechCorp Q3 2024)")

# Sample 3: API specification
cat > /tmp/ds_doc3.txt << 'EOF'
DocSense API Specification v2.0

Authentication: All endpoints require a valid JWT Bearer token in the
Authorization header. Access tokens expire after 15 minutes. Use POST
/api/auth/refresh with a valid refresh token to obtain a new access token.

Document Upload: POST /api/workspaces/:id/documents accepts multipart/form-data
with a 'file' field. Supported formats: PDF (max 50 MB) and TXT (max 10 MB).
The API returns a documentId and processing status ('processing').

Query Interface: POST /api/workspaces/:id/query accepts JSON with:
  - query (string, required): the user's question
  - session_id (string, optional): conversation context identifier
  - stream (boolean, default false): enable SSE streaming
When stream=true, the response uses Server-Sent Events (text/event-stream).

Rate Limits: Auth endpoints: 5 req/min. Document upload: 10 req/min.
Query endpoint: 30 req/min. All limits are per IP address.

Error Codes:
  400 Bad Request      — invalid input parameters
  401 Unauthorized     — missing or expired token
  404 Not Found        — resource does not exist
  413 Payload Too Large — file exceeds size limit
  429 Too Many Requests — rate limit exceeded
  500 Internal Server Error — unexpected server error
EOF

DOC3=$(upload_doc /tmp/ds_doc3.txt text/plain "API Specification (DocSense v2.0)")

rm -f /tmp/ds_doc1.txt /tmp/ds_doc2.txt /tmp/ds_doc3.txt

# ── Wait for processing ────────────────────────────────────────────────
echo ""
echo "Waiting for documents to finish processing (up to 90s)…"
printf "   "

READY_COUNT=0
for i in $(seq 1 30); do
  sleep 3
  printf "."
  READY_COUNT=0
  for DOC_ID in $DOC1 $DOC2 $DOC3; do
    [ -z "$DOC_ID" ] && continue
    STATUS=$(curl -s "$API/workspaces/$WS_ID/documents/$DOC_ID" \
      -H "Authorization: Bearer $TOKEN" --max-time 5 2>/dev/null || echo '{}')
    S=$(json_field "$STATUS" "d.get('status','')")
    [ "$S" = "ready" ] && READY_COUNT=$((READY_COUNT + 1))
  done
  [ "$READY_COUNT" -ge 3 ] && break
done

echo ""
[ "$READY_COUNT" -ge 3 ] \
  && ok "All documents are ready!" \
  || info "Some documents may still be processing (AI enrichment can take up to 2 min)."

# ── Summary ────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────"
printf "${green}✅ DocSense seeded successfully!${reset}\n\n"
echo "Demo credentials:"
printf "  Email:    %s\n" "$DEMO_EMAIL"
printf "  Password: %s\n" "$DEMO_PW"
echo ""
echo "Uploaded documents:"
echo "  • AI Research Paper (Attention Is All You Need)"
echo "  • Financial Report  (TechCorp Q3 2024)"
echo "  • API Specification (DocSense v2.0)"
echo ""
echo "Try asking:"
echo "  • 'What architecture does the Transformer use?'"
echo "  • 'What was TechCorp cloud revenue growth?'"
echo "  • 'What HTTP status code means too many requests?'"
echo "─────────────────────────────────────────────"
