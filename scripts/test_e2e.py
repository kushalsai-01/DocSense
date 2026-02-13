import requests
import time
import sys
import json

API_BASE = "http://localhost:8080"
AGENT_BASE = "http://localhost:8100"
RAG_BASE = "http://localhost:8000"

def print_status(message, status="INFO"):
    colors = {
        "INFO": "\033[94m",
        "SUCCESS": "\033[92m",
        "ERROR": "\033[91m",
        "WARNING": "\033[93m"
    }
    reset = "\033[0m"
    print(f"{colors.get(status, '')}{status}: {message}{reset}")

def check_service_health(name, url):
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            print_status(f"{name} is healthy", "SUCCESS")
            return True
        else:
            print_status(f"{name} returned status {response.status_code}", "ERROR")
            return False
    except Exception as e:
        print_status(f"{name} is unreachable: {e}", "ERROR")
        return False

def test_agent_query(query, expected_fields):
    print_status(f"Testing query: {query}", "INFO")
    
    payload = {
        "query": query,
        "user_id": "test_user",
        "session_id": f"test_session_{int(time.time())}",
        "document_ids": [],
        "enable_planning": True,
        "enable_evaluation": True,
        "include_trace": True,
        "include_suggestions": True
    }
    
    try:
        response = requests.post(f"{AGENT_BASE}/agent/query", json=payload, timeout=60)
        
        if response.status_code != 200:
            print_status(f"Query failed with status {response.status_code}", "ERROR")
            print_status(f"Response: {response.text}", "ERROR")
            return False
        
        data = response.json()
        
        for field in expected_fields:
            if field not in data:
                print_status(f"Missing field: {field}", "ERROR")
                return False
        
        print_status(f"Answer: {data.get('answer', 'N/A')[:100]}...", "SUCCESS")
        print_status(f"Strategy: {data.get('strategy', 'N/A')}", "INFO")
        print_status(f"Citations: {len(data.get('citations', []))}", "INFO")
        print_status(f"Trace steps: {len(data.get('agent_trace', []))}", "INFO")
        
        return True
        
    except Exception as e:
        print_status(f"Query test failed: {e}", "ERROR")
        return False

def test_conversation_persistence(session_id):
    print_status(f"Testing conversation retrieval for session: {session_id}", "INFO")
    
    try:
        response = requests.get(f"{AGENT_BASE}/agent/conversations/{session_id}", timeout=10)
        
        if response.status_code != 200:
            print_status(f"Conversation retrieval failed: {response.status_code}", "ERROR")
            return False
        
        data = response.json()
        print_status(f"Retrieved conversation with {data.get('message_count', 0)} messages", "SUCCESS")
        return True
        
    except Exception as e:
        print_status(f"Conversation test failed: {e}", "ERROR")
        return False

def test_agent_trace_logging(session_id):
    print_status(f"Testing agent trace logging for session: {session_id}", "INFO")
    
    try:
        response = requests.get(f"{AGENT_BASE}/agent/conversations/{session_id}/actions", timeout=10)
        
        if response.status_code != 200:
            print_status(f"Trace retrieval failed: {response.status_code}", "ERROR")
            return False
        
        data = response.json()
        print_status(f"Retrieved {len(data.get('actions', []))} agent actions", "SUCCESS")
        
        action_types = set(action.get('action_type') for action in data.get('actions', []))
        print_status(f"Action types logged: {', '.join(action_types)}", "INFO")
        
        return True
        
    except Exception as e:
        print_status(f"Trace logging test failed: {e}", "ERROR")
        return False

def main():
    print_status("=" * 60, "INFO")
    print_status("DocSense Agent Orchestration End-to-End Test", "INFO")
    print_status("=" * 60, "INFO")
    
    print_status("\nPhase 1: Health Checks", "INFO")
    print_status("-" * 40, "INFO")
    
    health_checks = [
        ("API Gateway", f"{API_BASE}/health"),
        ("RAG Service", f"{RAG_BASE}/health"),
        ("Agent Service", f"{AGENT_BASE}/agent/health")
    ]
    
    all_healthy = True
    for name, url in health_checks:
        if not check_service_health(name, url):
            all_healthy = False
    
    if not all_healthy:
        print_status("\nSome services are unhealthy. Aborting tests.", "ERROR")
        sys.exit(1)
    
    print_status("\nPhase 2: Simple Query Test", "INFO")
    print_status("-" * 40, "INFO")
    
    simple_query = "What is artificial intelligence?"
    simple_test = test_agent_query(
        simple_query,
        expected_fields=["answer", "citations", "strategy", "agent_trace", "suggestions"]
    )
    
    print_status("\nPhase 3: Complex Query Test", "INFO")
    print_status("-" * 40, "INFO")
    
    complex_query = "Compare machine learning and deep learning, and explain when to use each"
    complex_test = test_agent_query(
        complex_query,
        expected_fields=["answer", "citations", "strategy", "agent_trace"]
    )
    
    print_status("\nPhase 4: Conversation Persistence Test", "INFO")
    print_status("-" * 40, "INFO")
    
    test_session = f"test_session_{int(time.time())}"
    test_agent_query("What is Python?", expected_fields=["answer"])
    conversation_test = test_conversation_persistence(test_session)
    
    print_status("\nPhase 5: Agent Trace Logging Test", "INFO")
    print_status("-" * 40, "INFO")
    
    trace_test = test_agent_trace_logging(test_session)
    
    print_status("\nTest Summary", "INFO")
    print_status("=" * 60, "INFO")
    
    results = {
        "Services Health": all_healthy,
        "Simple Query": simple_test,
        "Complex Query": complex_test,
        "Conversation Persistence": conversation_test,
        "Agent Trace Logging": trace_test
    }
    
    for test_name, passed in results.items():
        status = "SUCCESS" if passed else "ERROR"
        symbol = "✓" if passed else "✗"
        print_status(f"{symbol} {test_name}", status)
    
    all_passed = all(results.values())
    
    if all_passed:
        print_status("\nAll tests passed!", "SUCCESS")
        sys.exit(0)
    else:
        print_status("\nSome tests failed!", "ERROR")
        sys.exit(1)

if __name__ == "__main__":
    main()
