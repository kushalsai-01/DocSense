import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "app"))

from app.main import app
from app.core.config import get_settings

@pytest.fixture
def mock_db_session():
    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_session.commit = AsyncMock()
    mock_session.rollback = AsyncMock()
    return mock_session

@pytest.fixture
async def test_client():
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.mark.asyncio
async def test_agent_query_endpoint_simple(test_client):
    with patch("app.agent.executor.AgentExecutor") as MockExecutor:
        mock_state = MagicMock()
        mock_state.status = "completed"
        mock_state.final_answer = "Paris is the capital of France."
        mock_state.citations = [{"content": "Paris", "score": 0.95}]
        mock_state.suggestions = ["What is the population of Paris?"]
        mock_state.strategy = "direct"
        mock_state.steps = []
        
        MockExecutor.return_value.execute = AsyncMock(return_value=mock_state)
        
        payload = {
            "query": "What is the capital of France?",
            "user_id": "test_user",
            "session_id": "test_session",
            "document_ids": [],
            "enable_planning": True,
            "enable_evaluation": True,
            "include_trace": True,
            "include_suggestions": True
        }
        
        response = await test_client.post("/agent/query", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["answer"] is not None
        assert "citations" in data
        assert "strategy" in data

@pytest.mark.asyncio
async def test_agent_query_endpoint_complex(test_client):
    with patch("app.agent.executor.AgentExecutor") as MockExecutor:
        mock_state = MagicMock()
        mock_state.status = "completed"
        mock_state.final_answer = "Comparison of GDP growth"
        mock_state.citations = []
        mock_state.suggestions = []
        mock_state.strategy = "decompose"
        mock_state.steps = [
            MagicMock(action_type="plan", tool_name=None),
            MagicMock(action_type="tool_execution", tool_name="search"),
            MagicMock(action_type="tool_execution", tool_name="compare")
        ]
        
        MockExecutor.return_value.execute = AsyncMock(return_value=mock_state)
        
        payload = {
            "query": "Compare GDP of USA and China",
            "user_id": "test_user",
            "session_id": "test_session"
        }
        
        response = await test_client.post("/agent/query", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["strategy"] == "decompose"

@pytest.mark.asyncio
async def test_agent_health_endpoint(test_client):
    with patch("app.agent.tools.RAGClient") as MockRAGClient:
        mock_rag = MockRAGClient.return_value
        mock_rag.health = AsyncMock(return_value={"status": "healthy"})
        
        with patch("app.core.database.get_engine") as mock_get_engine:
            mock_engine = MagicMock()
            mock_engine.connect = MagicMock()
            mock_get_engine.return_value = mock_engine
            
            response = await test_client.get("/agent/health")
            
            assert response.status_code == 200
            data = response.json()
            assert data["status"] in ["healthy", "degraded"]

@pytest.mark.asyncio
async def test_agent_conversation_retrieval(test_client):
    with patch("app.agent.memory.ConversationMemory") as MockMemory:
        mock_memory = MockMemory.return_value
        mock_memory.get_conversation_summary = AsyncMock(return_value={
            "id": "test_id",
            "session_id": "test_session",
            "message_count": 2,
            "messages": []
        })
        
        response = await test_client.get("/agent/conversations/test_session")
        
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data

@pytest.mark.asyncio
async def test_agent_conversation_deletion(test_client):
    with patch("app.agent.memory.ConversationMemory") as MockMemory:
        mock_memory = MockMemory.return_value
        mock_memory.delete_conversation = AsyncMock(return_value=True)
        
        response = await test_client.delete("/agent/conversations/test_session")
        
        assert response.status_code == 200

@pytest.mark.asyncio
async def test_agent_query_validation_error(test_client):
    payload = {
        "query": "",
        "user_id": "test_user"
    }
    
    response = await test_client.post("/agent/query", json=payload)
    
    assert response.status_code == 422

@pytest.mark.asyncio
async def test_agent_full_orchestration_flow():
    from app.agent.executor import AgentExecutor
    from app.agent.planner import Planner, QueryPlan
    from app.agent.tools import AgentTools, ToolResult
    from app.agent.evaluator import Evaluator
    from app.core.config import Settings
    
    config = Settings(
        agent_port=8100,
        rag_service_url="http://localhost:8000",
        db_host="localhost",
        db_port=5432,
        db_user="test",
        db_password="test",
        db_name="test",
        llm_provider="local",
        max_reasoning_steps=3
    )
    
    with patch("app.agent.tools.RAGClient") as MockRAGClient:
        mock_rag = MockRAGClient.return_value
        mock_rag.query = AsyncMock(return_value={
            "answer": "Test answer",
            "citations": [{"content": "test", "score": 0.9}],
            "chunks_retrieved": 1
        })
        
        with patch("app.agent.memory.ConversationMemory"):
            with patch("app.agent.router.LLMRouter"):
                executor = AgentExecutor(config)
                
                result = await executor.execute(
                    query="What is AI?",
                    user_id="test_user",
                    session_id="test_session"
                )
                
                assert result.status in ["completed", "max_steps_reached"]
                assert result.final_answer is not None

@pytest.mark.asyncio
async def test_agent_retry_logic():
    from app.agent.executor import AgentExecutor
    from app.core.config import Settings
    
    config = Settings(
        agent_port=8100,
        rag_service_url="http://localhost:8000",
        db_host="localhost",
        db_port=5432,
        db_user="test",
        db_password="test",
        db_name="test",
        llm_provider="local",
        max_reasoning_steps=5
    )
    
    call_count = 0
    
    async def failing_then_succeeding(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            return {"answer": "", "citations": [], "chunks_retrieved": 0}
        return {"answer": "Success", "citations": [{"content": "test", "score": 0.9}], "chunks_retrieved": 1}
    
    with patch("app.agent.tools.RAGClient") as MockRAGClient:
        mock_rag = MockRAGClient.return_value
        mock_rag.query = failing_then_succeeding
        
        with patch("app.agent.memory.ConversationMemory"):
            with patch("app.agent.router.LLMRouter"):
                executor = AgentExecutor(config)
                
                result = await executor.execute(
                    query="Test query",
                    user_id="test_user",
                    session_id="test_session"
                )
                
                assert call_count >= 2
                assert result.status == "completed"
