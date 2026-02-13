# Testing Guide

## Overview

DocSense includes comprehensive test suites for validating the Agentic AI orchestration layer.

## Test Structure

```
services/agent/tests/
├── conftest.py              # Shared fixtures and configuration
├── test_planner.py          # Query planning and strategy selection tests
├── test_executor.py         # ReAct execution loop tests
├── test_tools.py            # Tool execution (search, compare, summarize, extract) tests
├── test_evaluator.py        # Self-evaluation and quality assessment tests
└── test_integration.py      # End-to-end orchestration tests
```

## Running Tests

### Prerequisites

```bash
cd services/agent
pip install -r requirements-test.txt
```

### Run All Unit Tests

```bash
make test-agent
```

Or directly:

```bash
cd services/agent
python -m pytest tests/ -v
```

### Run With Coverage Report

```bash
make test-agent-cov
```

This generates an HTML coverage report in `services/agent/htmlcov/index.html`.

### Run Specific Test Files

```bash
# Test only the planner
python -m pytest tests/test_planner.py -v

# Test only the executor
python -m pytest tests/test_executor.py -v

# Test only integration
python -m pytest tests/test_integration.py -v
```

### Run End-to-End Tests (Requires Running Services)

```bash
# Start all services first
docker compose up -d

# Wait for services to be healthy
sleep 20

# Run E2E tests
make test-e2e
```

Or manually:

```bash
python scripts/test_e2e.py
```

## Test Categories

### 1. Planner Tests (`test_planner.py`)

Validates:
- Strategy selection (direct, decompose, compare, summarize, extract)
- Query complexity analysis
- Multi-step plan generation
- Heuristic pattern matching
- LLM fallback for ambiguous queries

### 2. Executor Tests (`test_executor.py`)

Validates:
- ReAct loop execution (Think → Act → Observe)
- Multi-step orchestration
- Tool result aggregation
- Max iteration limits
- Error recovery and retry logic
- State transitions

### 3. Tools Tests (`test_tools.py`)

Validates:
- RAG client HTTP communication
- Search tool execution
- Compare tool execution
- Summarize tool execution
- Extract tool execution
- Timeout handling
- Filter application (document IDs, user ID)

### 4. Evaluator Tests (`test_evaluator.py`)

Validates:
- Answer quality assessment (high/medium/low)
- Groundedness checks (citation presence)
- Completeness checks
- Coherence verification
- LLM-based verification
- Edge cases (empty answers, no citations, short answers)

### 5. Integration Tests (`test_integration.py`)

Validates:
- Full agent query flow
- API endpoint responses
- Health check endpoints
- Conversation retrieval
- Conversation deletion
- Request validation
- Complete orchestration with mocked dependencies
- Retry logic in full flow

### 6. End-to-End Tests (`scripts/test_e2e.py`)

Validates:
- All services running and healthy
- Real HTTP communication between services
- Database persistence
- Agent trace logging
- Conversation memory
- Multi-turn conversations

## Test Fixtures

### `mock_config`
Provides a test configuration with safe defaults.

### `mock_rag_response`
Sample RAG service response with answer and citations.

### `sample_query`
Simple factual query for basic tests.

### `complex_query`
Multi-part query requiring decomposition.

## Coverage Goals

- **Target**: >80% code coverage
- **Critical paths**: 100% coverage
  - Executor main loop
  - Planner strategy selection
  - Tool execution paths
  - Evaluator quality checks

## Running Tests in CI/CD

Example GitHub Actions workflow:

```yaml
name: Agent Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.12'
      - name: Install dependencies
        run: |
          cd services/agent
          pip install -r requirements.txt
          pip install -r requirements-test.txt
      - name: Run tests
        run: |
          cd services/agent
          pytest tests/ -v --cov=app --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./services/agent/coverage.xml
```

## Troubleshooting

### Import Errors

Ensure `PYTHONPATH` includes the app directory:

```bash
export PYTHONPATH="${PYTHONPATH}:$(pwd)/services/agent"
```

### Async Test Failures

Ensure `pytest-asyncio` is installed and `asyncio_mode = "auto"` is set in `pyproject.toml`.

### Database Connection Errors

Integration tests may require a test database. Use environment variables:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=docsense_test
export DB_USER=test
export DB_PASSWORD=test
```

### Mock Not Working

Verify patch targets match the actual import paths in the code:

```python
# If code does: from app.agent.tools import AgentTools
# Then patch:  "app.agent.tools.AgentTools"
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Mocking**: Mock external dependencies (RAG service, database, LLM)
3. **Fixtures**: Reuse common test data via fixtures
4. **Assertions**: Use descriptive assertion messages
5. **Cleanup**: Ensure tests clean up any created resources
6. **Performance**: Keep unit tests fast (<1s each)

## Writing New Tests

Template for a new test:

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_new_feature(mock_config):
    # Arrange
    mock_dependency = Mock()
    mock_dependency.method = AsyncMock(return_value="expected")
    
    # Act
    result = await function_under_test()
    
    # Assert
    assert result == "expected"
    mock_dependency.method.assert_called_once()
```

## Test Metrics

Run tests with timing:

```bash
pytest tests/ -v --durations=10
```

Generate coverage report:

```bash
pytest tests/ --cov=app --cov-report=html
open htmlcov/index.html
```
