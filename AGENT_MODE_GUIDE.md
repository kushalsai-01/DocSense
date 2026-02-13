# 🤖 Agent Mode - User Guide

## How to Test Agent Mode (Right Now!)

### 1. Open the Application
```
http://localhost:5173
```

### 2. Toggle Agent Mode

Look in the top-right corner of the chat interface. You'll see two buttons:

```
[RAG]  [Agent]
```

- **RAG** = Basic pipeline (green/gray)
- **Agent** = Agentic orchestration (purple/highlighted)

Click **Agent** to enable multi-step reasoning.

---

## What Happens Behind the Scenes?

### **RAG Mode (localhost:8000):**
```
1. Your question → Embedding
2. Vector search → Top 5 chunks
3. LLM generates answer
4. Done!
```

**Time: ~2-3 seconds**

### **Agent Mode (localhost:8100):**
```
1. Your question → Planner analyzes
2. Strategy selected (direct/decompose/compare/etc.)
3. Multi-step execution:
   - Tool 1: search("query part 1")
   - Tool 2: search("query part 2")
   - Tool 3: compare(results)
4. Synthesis combines all results
5. Evaluator validates quality
6. Done!
```

**Time: ~5-8 seconds** (worth it for complex queries!)

---

## Test Queries

### Try These in RAG Mode:

```
✅ "What is artificial intelligence?"
✅ "Who is the instructor?"
✅ "What topics are covered?"
```

**Expected:** Quick, direct answers.

---

### Try These in Agent Mode:

```
🤖 "Compare the main topics in Chapter 1 vs Chapter 2"
🤖 "Summarize all the assignments mentioned across the course"
🤖 "What are the prerequisites and how do they connect to the course content?"
🤖 "Extract all the deadlines mentioned in the course"
```

**Expected:** Structured, comprehensive answers with multiple perspectives.

---

## Visual Differences

### RAG Mode Response:
```
Based on the documents:

Artificial intelligence is the simulation of human intelligence 
by machines. It involves machine learning and deep learning...

[End]
```

### Agent Mode Response:
```
Let me break this down systematically:

**Chapter 1 Topics:**
- Linear Algebra fundamentals
- Matrix operations
- Vector spaces

**Chapter 2 Topics:**
- Probability theory
- Statistical distributions
- Bayesian inference

**Key Differences:**
Chapter 1 focuses on mathematical foundations...
Chapter 2 builds on these with probabilistic reasoning...

**Connections:**
Both chapters are prerequisites for understanding neural networks...

[End]
```

---

## Performance Comparison

| Aspect | RAG Mode | Agent Mode |
|--------|----------|------------|
| **Speed** | Fast (2-3s) | Slower (5-8s) |
| **Complexity** | Simple queries | Multi-part questions |
| **Depth** | Surface-level | Comprehensive |
| **Structure** | Basic paragraphs | Organized sections |
| **Accuracy** | Good for facts | Better for reasoning |
| **Cost** | Lower (fewer API calls) | Higher (multiple calls) |

---

## When to Use Each Mode?

### Use **RAG Mode** for:
- ❓ Quick factual lookups
- ❓ Simple "What is X?" questions
- ❓ When speed matters
- ❓ Single-concept queries

### Use **Agent Mode** for:
- 🤖 Comparisons ("Compare X vs Y")
- 🤖 Multi-step reasoning ("Explain A then B then their relationship")
- 🤖 Data extraction ("List all mentions of...")
- 🤖 Summarization ("Summarize chapters 1-5")
- 🤖 Complex analysis ("How does X relate to Y and Z?")

---

## Database: What Gets Stored?

### RAG Mode:
```sql
-- Nothing stored (stateless)
```

### Agent Mode:
```sql
-- Conversations table
INSERT INTO conversations (user_id, created_at) VALUES (...);

-- Messages table
INSERT INTO messages (conversation_id, role, content, citations) VALUES (...);

-- Agent actions table (for debugging)
INSERT INTO agent_actions (
  conversation_id,
  action_type,  -- "search", "compare", etc.
  tool_name,
  input,       -- Query sent to tool
  output,      -- Results
  duration,    -- Execution time
  success      -- true/false
) VALUES (...);
```

You can query these to see the agent's reasoning process!

---

## Inspect Agent Reasoning

Connect to PostgreSQL:

```bash
docker exec -it docsense-postgres psql -U docsense

# View recent conversations
SELECT * FROM conversations ORDER BY created_at DESC LIMIT 5;

# View agent actions for a specific conversation
SELECT 
  action_type,
  tool_name,
  duration,
  success
FROM agent_actions 
WHERE conversation_id = 'YOUR_CONVERSATION_ID'
ORDER BY created_at;

# Example output:
#  action_type | tool_name | duration | success
# -------------+-----------+----------+---------
#  search      | rag.search | 1.234   | true
#  search      | rag.search | 0.987   | true
#  compare     | compare    | 2.345   | true
#  evaluate    | evaluator  | 0.654   | true
```

---

## Troubleshooting

### Agent Mode Not Responding?

1. **Check Agent Service:**
```bash
docker compose ps agent
# Should show "healthy"

docker compose logs agent
# Look for errors
```

2. **Test API Directly:**
```bash
curl -X POST http://localhost:8100/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is AI?",
    "user_id": "00000000-0000-0000-0000-000000000001",
    "session_id": "test-1",
    "enable_planning": true
  }'
```

3. **Check Database Connection:**
```bash
docker compose logs postgres
# Agent needs DB for conversation storage
```

4. **Check Gemini API:**
```bash
# View agent env
docker compose exec agent env | grep GEMINI
# Should show: GEMINI_API_KEY=AIzaSyC...
```

---

## Configuration Options

You can customize agent behavior in `infra/compose/env/agent.env`:

```bash
# Enable/disable features
ENABLE_PLANNING=true          # Use planner
ENABLE_EVALUATION=true        # Validate answers
ENABLE_MEMORY=true            # Store conversations

# Performance tuning
MAX_REASONING_STEPS=5         # Max tool calls per query
TOOL_TIMEOUT_SECONDS=30       # Timeout for each tool
MAX_CONTEXT_LENGTH=8000       # Max tokens in context

# Strategy selection
DEFAULT_STRATEGY=auto         # auto, direct, decompose, compare
FALLBACK_TO_RAG=true         # Use RAG if agent fails

# Logging
LOG_LEVEL=INFO               # DEBUG for verbose logs
LOG_AGENT_ACTIONS=true       # Save all actions to DB
```

---

## Example Session

### 1. User Opens App
```
[Opens http://localhost:5173]
[Sees RAG and Agent buttons]
```

### 2. User Clicks "Agent" (turns purple)
```
Frontend state: pipelineMode = 'agent'
API endpoint: http://localhost:8100/agent/query
```

### 3. User Types Query
```
"Compare the prerequisites in Chapter 1 and Chapter 2"
```

### 4. Frontend Sends Request
```javascript
POST http://localhost:8100/agent/query
{
  "query": "Compare the prerequisites in Chapter 1 and Chapter 2",
  "user_id": "00000000-0000-0000-0000-000000000001",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "enable_planning": true
}
```

### 5. Agent Service Processes (5-8 seconds)

**Step 1: Planning**
```
Planner detects: comparison query
Strategy: "compare"
Steps: ["search chapter 1", "search chapter 2", "compare results"]
```

**Step 2: Execution**
```
Tool 1: search("Chapter 1 prerequisites")
  → Returns 5 chunks about linear algebra, calculus

Tool 2: search("Chapter 2 prerequisites")  
  → Returns 5 chunks about probability, statistics

Tool 3: compare(results_1, results_2)
  → Structures side-by-side comparison
```

**Step 3: Synthesis**
```
LLM combines results:
"Chapter 1 requires:
- Linear algebra (matrices, vectors)
- Calculus (derivatives)

Chapter 2 requires:
- Probability theory
- Statistical analysis

Both build foundational math skills..."
```

**Step 4: Evaluation**
```
Evaluator checks:
✓ Both chapters covered
✓ Citations present
✓ Comparison clear
Quality: 8.5/10
```

### 6. Frontend Displays Response
```
User sees structured answer with:
- Clear sections
- Multiple citations
- Comprehensive coverage
```

---

## Monitoring Agent Performance

### View Real-Time Logs:
```bash
# Watch agent logs
docker compose logs -f agent

# You'll see:
# [INFO] Received query: "Compare..."
# [INFO] Planning phase started
# [INFO] Selected strategy: compare
# [INFO] Executing tool: search
# [INFO] Tool execution time: 1.234s
# [INFO] Synthesis phase started
# [INFO] Evaluation phase started
# [INFO] Final score: 8.5/10
# [INFO] Response sent
```

### Check Database Stats:
```sql
-- Average response time
SELECT 
  AVG(duration) as avg_duration,
  COUNT(*) as total_queries
FROM agent_actions
WHERE action_type = 'query';

-- Success rate
SELECT 
  COUNT(CASE WHEN success = true THEN 1 END)::float / COUNT(*) * 100 as success_rate
FROM agent_actions;

-- Most used tools
SELECT 
  tool_name,
  COUNT(*) as usage_count
FROM agent_actions
GROUP BY tool_name
ORDER BY usage_count DESC;
```

---

## 🎉 Ready to Test!

1. Open [http://localhost:5173](http://localhost:5173)
2. Click the purple **Agent** button
3. Try: *"Compare Chapter 1 and Chapter 2 topics"*
4. Watch the magic happen! ✨

The agent will think, plan, execute multiple searches, and synthesize a comprehensive answer.

**Questions?** Check the logs or database to see exactly what the agent did!
