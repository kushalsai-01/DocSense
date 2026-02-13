import pytest
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "app"))

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
def mock_config():
    from app.core.config import Settings
    return Settings(
        agent_port=8100,
        rag_service_url="http://localhost:8000",
        db_host="localhost",
        db_port=5432,
        db_user="docsense",
        db_password="test",
        db_name="docsense_test",
        llm_provider="local",
        openai_api_key="test_key",
        max_reasoning_steps=5,
        enable_self_evaluation=True,
        enable_trace_logging=True
    )

@pytest.fixture
def mock_rag_response():
    return {
        "answer": "Test answer from RAG",
        "citations": [
            {"chunk_id": "test-1", "content": "Test chunk 1", "score": 0.95},
            {"chunk_id": "test-2", "content": "Test chunk 2", "score": 0.89}
        ],
        "chunks_retrieved": 2,
        "model_used": "test-model"
    }

@pytest.fixture
def sample_query():
    return "What is the capital of France?"

@pytest.fixture
def complex_query():
    return "Compare the GDP growth of USA and China over the last 5 years and explain the key factors"
