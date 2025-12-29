from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_endpoint(monkeypatch):
    import app.main as main_module

    # Avoid requiring a running Qdrant instance for unit tests.
    monkeypatch.setattr(main_module, "ensure_collection", lambda: None)

    with TestClient(main_module.app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
