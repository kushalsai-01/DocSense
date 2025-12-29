from __future__ import annotations

import sys
from pathlib import Path


# Allow `import app...` when running tests from the service root.
SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))
