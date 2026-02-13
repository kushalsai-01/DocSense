#!/usr/bin/env python3
"""Quick script to find all Python syntax errors in agent service."""
import ast
import sys
from pathlib import Path

def check_syntax(file_path):
    """Check if a Python file has syntax errors."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)
        return True, None
    except SyntaxError as e:
        return False, f"Line {e.lineno}: {e.msg}"
    except Exception as e:
        return False, str(e)

def main():
    base_dir = Path(__file__).parent
    agent_dir = base_dir / "services" / "agent" / "app"
    
    print("Checking Agent service Python files for syntax errors...\n")
    errors_found = False
    
    for py_file in agent_dir.rglob("*.py"):
        ok, error = check_syntax(py_file)
        if not ok:
            errors_found = True
            rel_path = py_file.relative_to(base_dir)
            print(f"❌ {rel_path}")
            print(f"   {error}\n")
    
    if not errors_found:
        print("✅ All Agent service Python files are syntactically valid!")
        return 0
    else:
        print("\n⚠️  Syntax errors found!")
        return 1

if __name__ == "__main__":
    sys.exit(main())
