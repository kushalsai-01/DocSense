# Agentic AI Features for DocSense

## 🤖 What is Agentic AI?

Agentic AI refers to AI systems that can autonomously:
- **Plan** multi-step tasks
- **Use tools** to accomplish goals
- **Make decisions** based on context
- **Learn** from interactions
- **Execute** complex workflows

---

## 🎯 Recommended Agentic Features for DocSense

### Phase 1: Basic Agent Capabilities (Week 1-2)

#### 1. **Multi-Document Reasoning**
- Agent decides which documents to search based on query
- Cross-references information from multiple sources
- Synthesizes answers from diverse chunks

**Implementation:**
```python
# Add to RAG service
class DocumentAgent:
    async def route_query(self, query: str, available_docs: List[str]):
        # Use LLM to classify query and select relevant documents
        classification = await self.llm.classify_query(query)
        return self.select_documents(classification, available_docs)
```

#### 2. **Query Decomposition**
- Break complex questions into sub-queries
- Execute searches in parallel
- Combine results intelligently

**Example:**
- User asks: "Compare the skills in both resumes"
- Agent breaks into:
  1. "Extract skills from document 1"
  2. "Extract skills from document 2"
  3. "Compare and contrast the lists"

**Implementation:**
```python
class QueryDecomposer:
    async def decompose(self, complex_query: str) -> List[SubQuery]:
        prompt = f"Break this into 3-5 simpler queries: {complex_query}"
        sub_queries = await self.llm.generate(prompt)
        return self.parse_sub_queries(sub_queries)
```

#### 3. **Tool Use - Document Actions**
- Agent can create summaries and save them
- Generate structured data (tables, lists)
- Export findings to different formats

**Tools to Add:**
```python
tools = [
    {
        "name": "create_summary",
        "description": "Create and save a summary of documents",
        "function": self.create_summary
    },
    {
        "name": "extract_entities",
        "description": "Extract people, companies, dates from documents",
        "function": self.extract_entities
    },
    {
        "name": "compare_documents",
        "description": "Generate comparison table",
        "function": self.compare_documents
    }
]
```

---

### Phase 2: Advanced Agent Capabilities (Week 3-4)

#### 4. **Conversational Memory**
- Remember previous questions in session
- Build context across multiple queries
- Clarify ambiguous questions

**Implementation:**
```python
class ConversationMemory:
    def __init__(self):
        self.history: List[Message] = []
        self.context_window = 10
    
    def add_exchange(self, question: str, answer: str, citations: List):
        self.history.append({
            "role": "user",
            "content": question,
            "timestamp": datetime.now()
        })
        self.history.append({
            "role": "assistant", 
            "content": answer,
            "citations": citations
        })
    
    def get_context(self) -> str:
        return format_conversation(self.history[-self.context_window:])
```

#### 5. **Proactive Suggestions**
- Suggest related questions
- Recommend documents to read
- Identify missing information

**Example:**
```python
async def generate_suggestions(self, current_query: str, answer: str):
    prompt = f"""
    User asked: {current_query}
    Answer: {answer}
    
    Suggest 3 follow-up questions they might want to ask.
    """
    suggestions = await self.llm.generate(prompt)
    return suggestions
```

#### 6. **Research Mode**
- User gives high-level goal
- Agent creates research plan
- Executes searches, summarizes, identifies gaps

**Workflow:**
```
User: "Research everything about Kushal's AI projects"
Agent:
  1. Search for "AI projects" → Find DocSense, FinTrack
  2. Extract details about each
  3. Identify technologies used
  4. Create comprehensive report
  5. Ask: "Would you like details on implementation?"
```

---

### Phase 3: Autonomous Workflows (Week 5-6)

#### 7. **Document Processing Pipeline**
- Automatically categorize documents
- Extract key information
- Generate metadata tags
- Create document summaries on upload

**Implementation:**
```python
class DocumentProcessor:
    async def process_new_document(self, doc_id: str):
        # Extract text
        text = await self.extract_text(doc_id)
        
        # Classify document type
        doc_type = await self.classify(text)
        
        # Extract entities
        entities = await self.extract_entities(text)
        
        # Generate tags
        tags = await self.generate_tags(text, entities)
        
        # Create summary
        summary = await self.summarize(text)
        
        # Store metadata
        await self.store_metadata(doc_id, {
            "type": doc_type,
            "entities": entities,
            "tags": tags,
            "summary": summary
        })
```

#### 8. **Smart Retrieval Strategies**
- Agent chooses retrieval method based on query type
- Hybrid search (dense + sparse)
- Query expansion and reformulation

**Strategy Selection:**
```python
class RetrievalAgent:
    async def select_strategy(self, query: str):
        strategies = {
            "factual": self.dense_retrieval,
            "keyword": self.sparse_retrieval,
            "semantic": self.hybrid_retrieval,
            "analytical": self.multi_hop_retrieval
        }
        
        query_type = await self.classify_query_type(query)
        return strategies[query_type]
```

#### 9. **Self-Correction**
- Agent evaluates its own answers
- Re-queries if confidence is low
- Asks clarifying questions

**Implementation:**
```python
async def answer_with_verification(self, query: str):
    # Generate initial answer
    answer = await self.generate_answer(query)
    
    # Self-evaluate
    confidence = await self.evaluate_answer(query, answer)
    
    if confidence < 0.7:
        # Try different retrieval strategy
        alternative = await self.retry_with_different_strategy(query)
        return alternative
    
    return answer
```

---

## 🛠️ Implementation Roadmap

### Architecture Changes Needed

#### 1. **Add Agent Service** (New Container)
```yaml
# docker-compose.yml
agent:
  build: ./services/agent
  container_name: docsense-agent
  env_file:
    - ./env/agent.env
  depends_on:
    - rag
    - api
  ports:
    - "8001:8001"
```

#### 2. **Agent Service Structure**
```
services/agent/
├── Dockerfile
├── requirements.txt
├── app/
│   ├── main.py
│   ├── agent/
│   │   ├── planner.py          # Query planning
│   │   ├── executor.py         # Tool execution
│   │   ├── memory.py           # Conversation memory
│   │   └── tools.py            # Available tools
│   ├── strategies/
│   │   ├── retrieval.py        # Retrieval strategies
│   │   ├── decomposition.py    # Query breakdown
│   │   └── synthesis.py        # Answer synthesis
│   └── api/
│       ├── routes.py
│       └── schemas.py
```

#### 3. **Database Schema Updates**
```sql
-- Add conversation tracking
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    role TEXT NOT NULL,  -- 'user' or 'assistant'
    content TEXT NOT NULL,
    citations JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add document metadata
CREATE TABLE document_metadata (
    document_id UUID PRIMARY KEY REFERENCES documents(id),
    auto_generated_summary TEXT,
    extracted_entities JSONB,
    tags TEXT[],
    document_type TEXT,
    processed_at TIMESTAMPTZ DEFAULT now()
);

-- Add agent actions log
CREATE TABLE agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    action_type TEXT NOT NULL,
    tool_name TEXT,
    input JSONB,
    output JSONB,
    success BOOLEAN,
    error_message TEXT,
    executed_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 📦 Required Libraries

### Python (Agent Service)
```txt
# requirements.txt for agent service
fastapi==0.110.0
pydantic==2.6.1
langchain==0.1.10
langgraph==0.0.20  # For agent graphs
openai==1.12.0
google-generativeai==0.4.0
instructor==0.5.0  # Structured outputs
tenacity==8.2.3  # Retries
redis==5.0.1  # For conversation caching
```

### Frontend (React)
```json
{
  "dependencies": {
    "@radix-ui/react-accordion": "^1.1.2",
    "react-markdown": "^9.0.1",
    "react-syntax-highlighter": "^15.5.0"
  }
}
```

---

## 🎨 UI Changes Needed

### 1. **Conversation View**
- Show conversation history in sidebar
- Display agent's thinking process
- Show which documents were consulted

### 2. **Agent Status Indicator**
```tsx
// components/AgentStatus.tsx
const AgentStatus = ({ status, currentAction }) => {
  return (
    <div className="agent-status">
      <Icon className={status === 'thinking' ? 'animate-spin' : ''} />
      <span>{currentAction}</span>
      {/* e.g., "Searching through 3 documents..." */}
    </div>
  );
};
```

### 3. **Suggested Questions**
```tsx
// Show below each answer
<div className="suggestions">
  <p>You might also want to ask:</p>
  {suggestions.map(q => (
    <button onClick={() => askQuestion(q)}>{q}</button>
  ))}
</div>
```

---

## 🚀 Quick Start: Implement First Agent Feature

### Let's Add: Multi-Step Query Decomposition

#### Step 1: Update RAG Service
```python
# services/rag/app/agent/decomposer.py

from typing import List
from pydantic import BaseModel

class SubQuery(BaseModel):
    question: str
    priority: int
    dependencies: List[int] = []

class QueryDecomposer:
    def __init__(self, llm):
        self.llm = llm
    
    async def decompose(self, complex_query: str) -> List[SubQuery]:
        prompt = f"""
        Break this complex question into 2-5 simpler sub-questions.
        Question: {complex_query}
        
        Return as JSON array with: question, priority (1-5), dependencies
        """
        
        response = await self.llm.generate(
            prompt,
            response_format={"type": "json_object"}
        )
        
        return [SubQuery(**sq) for sq in response['sub_queries']]
    
    async def execute_plan(self, sub_queries: List[SubQuery]):
        results = {}
        
        for sq in sorted(sub_queries, key=lambda x: x.priority, reverse=True):
            # Wait for dependencies
            if sq.dependencies:
                await self.wait_for_dependencies(sq.dependencies, results)
            
            # Execute sub-query
            result = await self.search_and_generate(sq.question)
            results[sq.priority] = result
        
        return self.synthesize_results(results)
```

#### Step 2: Add API Endpoint
```python
# services/rag/app/api/routes.py

@router.post("/query/complex", response_model=ComplexQueryResponse)
async def complex_query(request: QueryRequest):
    # Decompose query
    sub_queries = await decomposer.decompose(request.query)
    
    # Execute with plan
    result = await decomposer.execute_plan(sub_queries)
    
    return {
        "answer": result.answer,
        "sub_queries": [sq.question for sq in sub_queries],
        "citations": result.citations,
        "agent_trace": result.steps
    }
```

#### Step 3: Update Frontend
```tsx
// Add "Deep Analysis" button
const [analysisMode, setAnalysisMode] = useState<'simple' | 'deep'>('simple');

const handleQuery = async () => {
  const endpoint = analysisMode === 'deep' 
    ? '/query/complex' 
    : '/query';
    
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    body: JSON.stringify({ query, top_k: 5 })
  });
  
  // Show sub-queries if deep analysis
  if (response.sub_queries) {
    setSubQueries(response.sub_queries);
  }
};
```

---

## 📊 Agent Performance Metrics

Add tracking for:
- **Query decomposition accuracy**: Did sub-queries help?
- **Tool usage frequency**: Which tools are used most?
- **Answer quality**: User feedback (thumbs up/down)
- **Latency**: Time for multi-step queries
- **Success rate**: Queries answered vs failed

---

## 🧪 Testing Agentic Features

```python
# tests/test_agent.py

async def test_query_decomposition():
    query = "Compare technical skills between both resumes and tell me which has more AI experience"
    
    sub_queries = await agent.decompose(query)
    
    assert len(sub_queries) >= 2
    assert any("skills" in sq.question.lower() for sq in sub_queries)
    assert any("compare" in sq.question.lower() for sq in sub_queries)

async def test_tool_execution():
    result = await agent.execute_tool(
        "extract_entities",
        {"document_id": "test-doc-id"}
    )
    
    assert "entities" in result
    assert isinstance(result["entities"], list)
```

---

## 💡 Advanced Agentic Patterns

### 1. **ReAct Pattern** (Reasoning + Acting)
```
Thought: I need to find Kushal's AI projects
Action: search_documents(query="AI projects")
Observation: Found DocSense and FinTrack
Thought: I should get details about both
Action: extract_details(doc_ids=["doc1", "doc2"])
Observation: DocSense uses RAG, FinTrack uses ML
Thought: Now I can answer
Final Answer: Kushal has 2 AI projects...
```

### 2. **Chain of Thought**
Agent shows reasoning steps to user

### 3. **Tree of Thoughts**
Explore multiple reasoning paths, pick best

### 4. **Reflexion**
Agent critiques its own answer and improves

---

## 🎯 Next Steps for You

1. **Complete Pre-Deployment Checklist** (1-2 days)
   - Fix authentication
   - Upgrade Gemini API
   - Test thoroughly

2. **Deploy Current Version** (1 day)
   - Get it live first
   - Validate in production
   - Gather user feedback

3. **Start Phase 1 Agentic Features** (1-2 weeks)
   - Begin with query decomposition
   - Add conversation memory
   - Implement multi-document reasoning

4. **Iterate Based on Usage** (Ongoing)
   - See which features users want
   - Add agent capabilities incrementally

---

## 📚 Resources

- **LangChain Agents**: https://python.langchain.com/docs/modules/agents/
- **LangGraph**: https://github.com/langchain-ai/langgraph
- **OpenAI Function Calling**: https://platform.openai.com/docs/guides/function-calling
- **Gemini Function Calling**: https://ai.google.dev/gemini-api/docs/function-calling
- **ReAct Paper**: https://arxiv.org/abs/2210.03629

---

**Recommendation**: Deploy the current RAG system first, then add agentic features incrementally based on real user needs.
