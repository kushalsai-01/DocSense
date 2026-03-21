#!/usr/bin/env bash
# DocSense E2E Smoke Test
# Run after: docker compose up -d --build
# Usage: ./scripts/smoke-test.sh [--api-url http://...] [--rag-url http://...] [--agent-url http://...]
#
# Exit code 0  = all checks passed
# Exit code 1  = one or more checks failed
set -euo pipefail

# ── Parse optional override flags ─────────────────────────────────────
API="${API_URL:-http://localhost/api}"
RAG="${RAG_URL:-http://localhost:8000}"
AGENT="${AGENT_URL:-http://localhost:8100}"

for arg in "$@"; do
  case "$arg" in
    --api-url=*)   API="${arg#*=}" ;;
    --rag-url=*)   RAG="${arg#*=}" ;;
    --agent-url=*) AGENT="${arg#*=}" ;;
  esac
done

PASS=0
FAIL=0
SKIPPED=0

# ── Helpers ────────────────────────────────────────────────────────────
green='\033[0;32m'
red='\033[0;31m'
yellow='\033[0;33m'
reset='\033[0m'

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    printf "  ${green}✅${reset} %s\n" "$name"
    PASS=$((PASS + 1))
  else
    printf "  ${red}❌${reset} %s  (expected '%s', got '%s')\n" "$name" "$expected" "$actual"
    FAIL=$((FAIL + 1))
  fi
}

skip() {
  printf "  ${yellow}⏭${reset}  %s (skipped)\n" "$1"
  SKIPPED=$((SKIPPED + 1))
}

http_status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$@" 2>/dev/null || echo "000"
}

json_field() {
  # json_field <json_string> <python_expression>
  python3 -c "
import sys, json
try:
  d = json.loads(sys.argv[1])
  print($2)
except Exception:
  print('')
" "$1" 2>/dev/null || echo ""
}

section() {
  printf "\n── %s ──\n" "$1"
}

# ── Ensure required tools are available ───────────────────────────────
for tool in curl python3; do
  if ! command -v "$tool" &>/dev/null; then
    echo "ERROR: '$tool' is required but not found in PATH."
    exit 1
  fi
done

echo "🔍 DocSense Smoke Tests"
printf "  API:   %s\n" "$API"
printf "  RAG:   %s\n" "$RAG"
printf "  Agent: %s\n" "$AGENT"

# ─────────────────────────────────────────────────────────────────────
section "Service health"

STATUS=$(http_status "$API/health")
check "GET /api/health → 200" "200" "$STATUS"

RAG_STATUS=$(http_status "$RAG/health")
check "RAG /health → 200" "200" "$RAG_STATUS"

AGENT_STATUS=$(http_status "$AGENT/health")
check "Agent /health → 200" "200" "$AGENT_STATUS"

READY_STATUS=$(http_status "$API/ready")
check "GET /api/ready → 200" "200" "$READY_STATUS"

# ─────────────────────────────────────────────────────────────────────
section "Authentication"

TEST_EMAIL="smoketest_$(date +%s)@docsense.dev"
TEST_PW="Smoke@Test123"

REG_BODY=$(curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PW\",\"name\":\"Smoke Test\"}" \
  --max-time 15 2>/dev/null || echo '{}')

REG_STATUS=$(json_field "$REG_BODY" "str(d.get('user',{}).get('id',''))")
check "POST /auth/register → user created" "1" "$([ -n "$REG_STATUS" ] && echo 1 || echo 0)"

LOGIN_BODY=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PW\"}" \
  --max-time 10 2>/dev/null || echo '{}')

TOKEN=$(json_field "$LOGIN_BODY" "d.get('token',d.get('data',{}).get('tokens',{}).get('accessToken',''))")
REFRESH_TOKEN=$(json_field "$LOGIN_BODY" "d.get('refreshToken',d.get('data',{}).get('tokens',{}).get('refreshToken',''))")
check "POST /auth/login → token received" "1" "$([ -n "$TOKEN" ] && echo 1 || echo 0)"

if [ -z "$TOKEN" ]; then
  echo ""
  printf "${red}FATAL: No access token — cannot continue authentication-dependent tests.${reset}\n"
  echo "── Results ──────────────────────────────────────────────"
  printf "  ${green}✅ %d passed${reset}  ${red}❌ %d failed${reset}  ${yellow}⏭ %d skipped${reset}\n" \
    "$PASS" "$FAIL" "$((SKIPPED + 7))"
  exit 1
fi

ME_STATUS=$(http_status "$API/auth/me" -H "Authorization: Bearer $TOKEN")
check "GET /auth/me with token → 200" "200" "$ME_STATUS"

NO_AUTH_STATUS=$(http_status "$API/auth/me")
check "GET /auth/me without token → 401" "401" "$NO_AUTH_STATUS"

# ─────────────────────────────────────────────────────────────────────
section "Workspace"

WS_BODY=$(json_field "$LOGIN_BODY" "str(d.get('workspace',{}).get('id',''))")
WS_ID="${WS_BODY:-default}"

DOCS_STATUS=$(http_status "$API/workspaces/$WS_ID/documents" -H "Authorization: Bearer $TOKEN")
check "GET /workspaces/:id/documents → 200" "200" "$DOCS_STATUS"

# ─────────────────────────────────────────────────────────────────────
section "Document upload"

echo -n "DocSense smoke test: automated document validation content. Keywords: API testing, integration, verification." > /tmp/docsense_smoke.txt

UPLOAD_BODY=$(curl -s -X POST "$API/workspaces/$WS_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/docsense_smoke.txt;type=text/plain" \
  --max-time 30 2>/dev/null || echo '{}')

DOC_ID=$(json_field "$UPLOAD_BODY" "d.get('documentId',d.get('id',''))")
check "POST /workspaces/:id/documents → document id returned" "1" \
  "$([ -n "$DOC_ID" ] && echo 1 || echo 0)"

rm -f /tmp/docsense_smoke.txt

# ─────────────────────────────────────────────────────────────────────
section "Document processing (poll for 'ready')"

DOC_FINAL_STATUS=""
if [ -n "$DOC_ID" ]; then
  for i in $(seq 1 20); do
    sleep 3
    STATUS_BODY=$(curl -s "$API/workspaces/$WS_ID/documents/$DOC_ID" \
      -H "Authorization: Bearer $TOKEN" --max-time 5 2>/dev/null || echo '{}')
    DOC_FINAL_STATUS=$(json_field "$STATUS_BODY" "d.get('status','')")
    if [ "$DOC_FINAL_STATUS" = "ready" ] || [ "$DOC_FINAL_STATUS" = "error" ]; then
      break
    fi
  done
  check "Document processed to 'ready'" "ready" "$DOC_FINAL_STATUS"
else
  skip "Document processing (no document ID)"
fi

# ─────────────────────────────────────────────────────────────────────
section "Query"

if [ -n "$DOC_ID" ] && [ "$DOC_FINAL_STATUS" = "ready" ]; then
  QUERY_BODY=$(curl -s -X POST "$API/workspaces/$WS_ID/query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"What is this document about?\",\"session_id\":\"smoke-$(date +%s)\",\"stream\":false}" \
    --max-time 30 2>/dev/null || echo '{}')

  HAS_ANSWER=$(json_field "$QUERY_BODY" "1 if d.get('answer') else 0")
  check "POST /workspaces/:id/query → has answer field" "1" "$HAS_ANSWER"
else
  skip "Query test (document not ready)"
fi

# ─────────────────────────────────────────────────────────────────────
section "Conversations"

CONV_STATUS=$(http_status "$API/workspaces/$WS_ID/conversations" -H "Authorization: Bearer $TOKEN")
check "GET /workspaces/:id/conversations → 200" "200" "$CONV_STATUS"

# ─────────────────────────────────────────────────────────────────────
section "Analytics"

ANALYTICS_STATUS=$(http_status "$API/workspaces/$WS_ID/analytics" -H "Authorization: Bearer $TOKEN")
check "GET /workspaces/:id/analytics → 200" "200" "$ANALYTICS_STATUS"

STORAGE_STATUS=$(http_status "$API/analytics/storage" -H "Authorization: Bearer $TOKEN")
check "GET /analytics/storage → 200" "200" "$STORAGE_STATUS"

# ─────────────────────────────────────────────────────────────────────
section "Logout + token blacklist"

LOGOUT_BODY=$(curl -s -X POST "$API/auth/logout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" \
  --max-time 10 2>/dev/null || echo '{}')
LOGOUT_OK=$(json_field "$LOGOUT_BODY" "1 if d.get('success') else 0")
check "POST /auth/logout → success" "1" "$LOGOUT_OK"

REVOKED_STATUS=$(http_status "$API/auth/me" -H "Authorization: Bearer $TOKEN")
check "GET /auth/me after logout → 401" "401" "$REVOKED_STATUS"

# ─────────────────────────────────────────────────────────────────────
section "RAG service internals"

if [ "$RAG_STATUS" = "200" ]; then
  RAG_HEALTH=$(curl -s "$RAG/health" --max-time 5 2>/dev/null || echo '{}')
  RAG_STATUS_FIELD=$(json_field "$RAG_HEALTH" "d.get('status','error')")
  check "RAG health returns status ok" "ok" "$RAG_STATUS_FIELD"

  EVAL_BODY=$(curl -s -X POST "$RAG/eval" \
    -H "Content-Type: application/json" \
    -d '{"question":"test","answer":"test answer","contexts":["test context"]}' \
    --max-time 60 2>/dev/null || echo '{}')
  HAS_FAITH=$(json_field "$EVAL_BODY" "1 if 'faithfulness' in d else 0")
  check "RAG POST /eval → faithfulness score returned" "1" "$HAS_FAITH"
else
  skip "RAG internals (service unreachable)"
fi

# ─────────────────────────────────────────────────────────────────────
printf "\n─────────────────────────────────────────────────────────────\n"
printf "Results: ${green}✅ %d passed${reset}  ${red}❌ %d failed${reset}  ${yellow}⏭ %d skipped${reset}\n\n" \
  "$PASS" "$FAIL" "$SKIPPED"

if [ "$FAIL" -gt 0 ]; then
  echo "Investigate failures with: docker compose logs --tail=100"
  exit 1
fi

echo "🎉 All DocSense smoke tests passed!"
exit 0
