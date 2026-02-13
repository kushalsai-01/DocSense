import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.agent.tools import AgentTools, ToolResult, RAGClient
from app.core.config import Settings
import httpx

@pytest.fixture
def rag_client(mock_config):
    return RAGClient(base_url=mock_config.rag_service_url)

@pytest.fixture
def agent_tools(mock_config):
    return AgentTools(mock_config)

@pytest.mark.asyncio
async def test_rag_client_query_success(rag_client, mock_rag_response):
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = mock_rag_response
        mock_post.return_value = mock_response
        
        result = await rag_client.query("Test query", top_k=5)
        
        assert result is not None
        assert "answer" in result

@pytest.mark.asyncio
async def test_rag_client_query_failure(rag_client):
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.side_effect = httpx.RequestError("Connection failed")
        
        result = await rag_client.query("Test query")
        
        assert result is None

@pytest.mark.asyncio
async def test_search_tool_success(agent_tools, mock_rag_response):
    with patch.object(agent_tools.rag_client, "query", new_callable=AsyncMock) as mock_query:
        mock_query.return_value = mock_rag_response
        
        result = await agent_tools.search("What is AI?", document_ids=[])
        
        assert result.success is True
        assert result.tool_name == "search"
        assert result.output is not None
        assert len(result.citations) > 0

@pytest.mark.asyncio
async def test_search_tool_no_results(agent_tools):
    with patch.object(agent_tools.rag_client, "query", new_callable=AsyncMock) as mock_query:
        mock_query.return_value = {"answer": "", "citations": [], "chunks_retrieved": 0}
        
        result = await agent_tools.search("obscure query", document_ids=[])
        
        assert result.success is False
        assert result.error is not None

@pytest.mark.asyncio
async def test_compare_tool(agent_tools, mock_rag_response):
    with patch.object(agent_tools.rag_client, "query", new_callable=AsyncMock) as mock_query:
        mock_query.return_value = mock_rag_response
        
        result = await agent_tools.compare("Python", "JavaScript", document_ids=[])
        
        assert result.success is True
        assert result.tool_name == "compare"
        assert "Python" in result.metadata or "JavaScript" in result.metadata

@pytest.mark.asyncio
async def test_summarize_tool(agent_tools, mock_rag_response):
    with patch.object(agent_tools.rag_client, "query", new_callable=AsyncMock) as mock_query:
        mock_query.return_value = mock_rag_response
        
        result = await agent_tools.summarize("test_doc_id")
        
        assert result.success is True
        assert result.tool_name == "summarize"

@pytest.mark.asyncio
async def test_extract_tool(agent_tools, mock_rag_response):
    with patch.object(agent_tools.rag_client, "query", new_callable=AsyncMock) as mock_query:
        mock_query.return_value = mock_rag_response
        
        result = await agent_tools.extract("dates", "test_doc_id")
        
        assert result.success is True
        assert result.tool_name == "extract"

@pytest.mark.asyncio
async def test_tool_timeout_handling(agent_tools):
    with patch.object(agent_tools.rag_client, "query", new_callable=AsyncMock) as mock_query:
        mock_query.side_effect = httpx.TimeoutException("Request timeout")
        
        result = await agent_tools.search("test query", document_ids=[])
        
        assert result.success is False
        assert "timeout" in result.error.lower() or "error" in result.error.lower()

@pytest.mark.asyncio
async def test_tool_with_filters(agent_tools, mock_rag_response):
    with patch.object(agent_tools.rag_client, "query", new_callable=AsyncMock) as mock_query:
        mock_query.return_value = mock_rag_response
        
        result = await agent_tools.search(
            "AI trends",
            document_ids=["doc1", "doc2"],
            user_id="user123"
        )
        
        assert result.success is True
        mock_query.assert_called_once()
        args, kwargs = mock_query.call_args
        assert "document_ids" in kwargs or len(args) > 1
