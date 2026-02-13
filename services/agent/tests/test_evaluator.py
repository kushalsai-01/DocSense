import pytest
from unittest.mock import AsyncMock, patch
from app.agent.evaluator import Evaluator
from app.agent.tools import ToolResult
from app.core.config import Settings

@pytest.fixture
def evaluator(mock_config):
    return Evaluator(mock_config)

@pytest.mark.asyncio
async def test_evaluate_high_quality_answer(evaluator):
    answer = "Paris is the capital of France, located in the northern part of the country."
    citations = [
        {"content": "Paris is the capital", "score": 0.95},
        {"content": "France is located in northern Europe", "score": 0.89}
    ]
    
    result = await evaluator.evaluate(
        query="What is the capital of France?",
        answer=answer,
        citations=citations,
        tool_results=[]
    )
    
    assert result["quality"] in ["high", "medium"]
    assert result["grounded"] is True
    assert result["complete"] is True

@pytest.mark.asyncio
async def test_evaluate_empty_answer(evaluator):
    result = await evaluator.evaluate(
        query="Test query",
        answer="",
        citations=[],
        tool_results=[]
    )
    
    assert result["quality"] == "low"
    assert result["complete"] is False

@pytest.mark.asyncio
async def test_evaluate_no_citations(evaluator):
    answer = "This is an answer without any supporting evidence."
    
    result = await evaluator.evaluate(
        query="Test query",
        answer=answer,
        citations=[],
        tool_results=[]
    )
    
    assert result["grounded"] is False

@pytest.mark.asyncio
async def test_evaluate_short_answer(evaluator):
    result = await evaluator.evaluate(
        query="Explain quantum physics in detail",
        answer="Quantum.",
        citations=[{"content": "quantum", "score": 0.5}],
        tool_results=[]
    )
    
    assert result["quality"] in ["low", "medium"]
    assert result["complete"] is False

@pytest.mark.asyncio
async def test_evaluate_with_llm_verification(evaluator):
    with patch("app.agent.router.LLMRouter") as MockRouter:
        mock_router = MockRouter.return_value
        mock_router.agenerate = AsyncMock(return_value="The answer is well-grounded and complete.")
        
        answer = "Detailed answer with good coverage of the topic."
        citations = [{"content": "supporting text", "score": 0.9}]
        
        result = await evaluator.evaluate(
            query="Complex question",
            answer=answer,
            citations=citations,
            tool_results=[]
        )
        
        assert result is not None
        assert "quality" in result

@pytest.mark.asyncio
async def test_evaluate_coherence_check(evaluator):
    incoherent_answer = "France. Also, the sky is blue. Unrelated fact about penguins."
    citations = [{"content": "France info", "score": 0.8}]
    
    result = await evaluator.evaluate(
        query="What is the capital of France?",
        answer=incoherent_answer,
        citations=citations,
        tool_results=[]
    )
    
    assert result["coherent"] is not None

@pytest.mark.asyncio
async def test_evaluate_with_tool_results(evaluator):
    tool_results = [
        ToolResult(success=True, output="Result 1", citations=[], tool_name="search"),
        ToolResult(success=True, output="Result 2", citations=[], tool_name="search")
    ]
    
    result = await evaluator.evaluate(
        query="Multi-step query",
        answer="Combined answer from multiple sources",
        citations=[{"content": "citation", "score": 0.9}],
        tool_results=tool_results
    )
    
    assert result is not None
    assert result["complete"] is True

@pytest.mark.asyncio
async def test_evaluate_partial_answer(evaluator):
    answer = "I can partially answer this: Paris is a city in France."
    citations = [{"content": "Paris", "score": 0.7}]
    
    result = await evaluator.evaluate(
        query="What is the capital, population, and history of France?",
        answer=answer,
        citations=citations,
        tool_results=[]
    )
    
    assert result["quality"] in ["low", "medium"]
    assert result["complete"] is False or result["quality"] != "high"
