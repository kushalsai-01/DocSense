import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.agent.planner import Planner, QueryPlan
from app.core.config import Settings

@pytest.fixture
def planner(mock_config):
    return Planner(mock_config)

@pytest.mark.asyncio
async def test_planner_direct_strategy_simple_query(planner, sample_query):
    plan = await planner.plan(sample_query, conversation_context=[])
    
    assert plan.strategy == "direct"
    assert len(plan.steps) >= 1
    assert plan.reasoning is not None

@pytest.mark.asyncio
async def test_planner_decompose_strategy_complex_query(planner, complex_query):
    plan = await planner.plan(complex_query, conversation_context=[])
    
    assert plan.strategy in ["decompose", "compare"]
    assert len(plan.steps) >= 2

@pytest.mark.asyncio
async def test_planner_compare_strategy(planner):
    query = "Compare Python and JavaScript for web development"
    plan = await planner.plan(query, conversation_context=[])
    
    assert plan.strategy == "compare"
    assert len(plan.steps) >= 2
    assert any("Python" in step for step in plan.steps)
    assert any("JavaScript" in step for step in plan.steps)

@pytest.mark.asyncio
async def test_planner_summarize_strategy(planner):
    query = "Summarize the main points of document X"
    plan = await planner.plan(query, conversation_context=[])
    
    assert plan.strategy in ["summarize", "extract"]

@pytest.mark.asyncio
async def test_planner_extract_strategy(planner):
    query = "Extract all dates mentioned in the document"
    plan = await planner.plan(query, conversation_context=[])
    
    assert plan.strategy == "extract"

@pytest.mark.asyncio
async def test_planner_with_conversation_context(planner, sample_query):
    context = [
        {"role": "user", "content": "Tell me about France"},
        {"role": "assistant", "content": "France is a country in Europe"}
    ]
    
    plan = await planner.plan(sample_query, conversation_context=context)
    
    assert plan is not None
    assert plan.strategy is not None

@pytest.mark.asyncio
async def test_planner_llm_fallback(planner):
    with patch.object(planner, "_plan_with_llm", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = QueryPlan(
            strategy="direct",
            steps=["Search for information"],
            reasoning="LLM-generated plan"
        )
        
        query = "Some ambiguous query that needs LLM"
        plan = await planner.plan(query, conversation_context=[])
        
        assert plan.reasoning == "LLM-generated plan"
