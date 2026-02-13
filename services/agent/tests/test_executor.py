import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.agent.executor import AgentExecutor, AgentState, AgentStep
from app.agent.planner import QueryPlan
from app.agent.tools import ToolResult
from app.core.config import Settings

@pytest.fixture
def executor(mock_config):
    return AgentExecutor(mock_config)

@pytest.fixture
def simple_plan():
    return QueryPlan(
        strategy="direct",
        steps=["Search for information about capital of France"],
        reasoning="Simple factual query"
    )

@pytest.fixture
def complex_plan():
    return QueryPlan(
        strategy="decompose",
        steps=[
            "Search for GDP data of USA",
            "Search for GDP data of China",
            "Compare the results"
        ],
        reasoning="Multi-step comparison query"
    )

@pytest.mark.asyncio
async def test_executor_simple_query_execution(executor, sample_query, simple_plan, mock_rag_response):
    with patch("app.agent.tools.AgentTools") as MockTools:
        mock_tools = MockTools.return_value
        mock_tools.search = AsyncMock(return_value=ToolResult(
            success=True,
            output=mock_rag_response["answer"],
            citations=mock_rag_response["citations"],
            tool_name="search"
        ))
        
        with patch("app.agent.planner.Planner") as MockPlanner:
            MockPlanner.return_value.plan = AsyncMock(return_value=simple_plan)
            
            with patch("app.agent.evaluator.Evaluator") as MockEvaluator:
                MockEvaluator.return_value.evaluate = AsyncMock(return_value={
                    "quality": "high",
                    "grounded": True,
                    "complete": True,
                    "coherent": True
                })
                
                result = await executor.execute(sample_query, user_id="test_user", session_id="test_session")
                
                assert result.status == "completed"
                assert result.final_answer is not None
                assert len(result.citations) > 0
                assert len(result.steps) > 0

@pytest.mark.asyncio
async def test_executor_multi_step_execution(executor, complex_query, complex_plan, mock_rag_response):
    with patch("app.agent.tools.AgentTools") as MockTools:
        mock_tools = MockTools.return_value
        mock_tools.search = AsyncMock(return_value=ToolResult(
            success=True,
            output="GDP data retrieved",
            citations=[],
            tool_name="search"
        ))
        mock_tools.compare = AsyncMock(return_value=ToolResult(
            success=True,
            output="Comparison completed",
            citations=[],
            tool_name="compare"
        ))
        
        with patch("app.agent.planner.Planner") as MockPlanner:
            MockPlanner.return_value.plan = AsyncMock(return_value=complex_plan)
            
            with patch("app.agent.evaluator.Evaluator") as MockEvaluator:
                MockEvaluator.return_value.evaluate = AsyncMock(return_value={
                    "quality": "high",
                    "grounded": True,
                    "complete": True,
                    "coherent": True
                })
                
                result = await executor.execute(complex_query, user_id="test_user", session_id="test_session")
                
                assert result.status == "completed"
                assert len(result.steps) >= 3

@pytest.mark.asyncio
async def test_executor_max_steps_limit(executor, sample_query):
    with patch("app.agent.tools.AgentTools") as MockTools:
        mock_tools = MockTools.return_value
        mock_tools.search = AsyncMock(return_value=ToolResult(
            success=False,
            output="",
            citations=[],
            tool_name="search",
            error="Insufficient information"
        ))
        
        with patch("app.agent.planner.Planner") as MockPlanner:
            MockPlanner.return_value.plan = AsyncMock(return_value=QueryPlan(
                strategy="direct",
                steps=["Keep searching"],
                reasoning="Test"
            ))
            
            result = await executor.execute(sample_query, user_id="test_user", session_id="test_session")
            
            assert result.status in ["completed", "max_steps_reached"]
            assert len(result.steps) <= executor.config.max_reasoning_steps

@pytest.mark.asyncio
async def test_executor_tool_failure_recovery(executor, sample_query, simple_plan):
    call_count = 0
    
    async def mock_search(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return ToolResult(success=False, output="", citations=[], tool_name="search", error="Network error")
        return ToolResult(success=True, output="Recovered answer", citations=[], tool_name="search")
    
    with patch("app.agent.tools.AgentTools") as MockTools:
        mock_tools = MockTools.return_value
        mock_tools.search = mock_search
        
        with patch("app.agent.planner.Planner") as MockPlanner:
            MockPlanner.return_value.plan = AsyncMock(return_value=simple_plan)
            
            with patch("app.agent.evaluator.Evaluator") as MockEvaluator:
                MockEvaluator.return_value.evaluate = AsyncMock(return_value={
                    "quality": "medium",
                    "grounded": True,
                    "complete": True,
                    "coherent": True
                })
                
                result = await executor.execute(sample_query, user_id="test_user", session_id="test_session")
                
                assert call_count >= 1
                assert result.status == "completed"

@pytest.mark.asyncio
async def test_executor_state_transitions(executor, sample_query, simple_plan, mock_rag_response):
    with patch("app.agent.tools.AgentTools") as MockTools:
        mock_tools = MockTools.return_value
        mock_tools.search = AsyncMock(return_value=ToolResult(
            success=True,
            output=mock_rag_response["answer"],
            citations=mock_rag_response["citations"],
            tool_name="search"
        ))
        
        with patch("app.agent.planner.Planner") as MockPlanner:
            MockPlanner.return_value.plan = AsyncMock(return_value=simple_plan)
            
            with patch("app.agent.evaluator.Evaluator") as MockEvaluator:
                MockEvaluator.return_value.evaluate = AsyncMock(return_value={
                    "quality": "high",
                    "grounded": True,
                    "complete": True,
                    "coherent": True
                })
                
                result = await executor.execute(sample_query, user_id="test_user", session_id="test_session")
                
                step_types = [step.action_type for step in result.steps]
                assert "plan" in step_types
                assert "tool_execution" in step_types
                assert "evaluation" in step_types
