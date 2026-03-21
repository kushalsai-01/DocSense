from __future__ import annotations
import httpx
from app.core.config import settings
from app.core.logging import get_logger

try:
    from langsmith import traceable as _traceable
except ImportError:
    def _traceable(**_kwargs):  # type: ignore[misc]
        """No-op decorator when langsmith is not installed."""
        def decorator(fn):
            return fn
        return decorator

logger = get_logger(__name__)
class ToolResult:
    def __init__(self, tool_name: str, success: bool, data: dict | list | str, error: str | None = None):
        self.tool_name = tool_name
        self.success = success
        self.data = data
        self.error = error
    def to_dict(self) -> dict:
        return {
            "tool": self.tool_name,
            "success": self.success,
            "data": self.data,
            "error": self.error,
        }
class RAGClient:
    def __init__(self, base_url: str | None = None, timeout: int | None = None):
        self.base_url = (base_url or settings.rag_service_url).rstrip("/")
        self.timeout = timeout or settings.rag_service_timeout
    async def search(self, query: str, top_k: int = 5) -> ToolResult:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/query",
                    json={
                        "query": query,
                        "top_k": top_k,
                        "use_decomposition": False,
                        "include_suggestions": False,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return ToolResult(
                    tool_name="search",
                    success=True,
                    data={
                        "answer": data.get("answer", ""),
                        "citations": data.get("citations", []),
                        "matches": data.get("matches", []),
                    },
                )
        except Exception as exc:
            logger.error("rag_search_failed", error=str(exc), query=query)
            return ToolResult(tool_name="search", success=False, data={}, error=str(exc))
    async def embed(self, document_id: str, chunks: list[dict]) -> ToolResult:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/embed",
                    json={"document_id": document_id, "chunks": chunks},
                )
                resp.raise_for_status()
                return ToolResult(tool_name="embed", success=True, data=resp.json())
        except Exception as exc:
            logger.error("rag_embed_failed", error=str(exc))
            return ToolResult(tool_name="embed", success=False, data={}, error=str(exc))
class AgentTools:
    def __init__(self, rag_client: RAGClient | None = None):
        self.rag = rag_client or RAGClient()

    @_traceable(name="tool_search", tags=["tools", "search"])
    async def search(self, query: str, top_k: int = 5) -> ToolResult:
        logger.info("tool_search", query=query, top_k=top_k)
        return await self.rag.search(query, top_k)

    @_traceable(name="tool_compare", tags=["tools", "compare"])
    async def compare(self, queries: list[str], top_k: int = 3) -> ToolResult:
        logger.info("tool_compare", num_queries=len(queries))
        results = []
        for q in queries:
            result = await self.rag.search(q, top_k)
            results.append({
                "query": q,
                "answer": result.data.get("answer", "") if result.success else "",
                "citations": result.data.get("citations", []) if result.success else [],
            })
        return ToolResult(tool_name="compare", success=True, data=results)

    @_traceable(name="tool_summarize", tags=["tools", "summarize"])
    async def summarize(self, query: str, top_k: int = 8) -> ToolResult:
        logger.info("tool_summarize", query=query)
        result = await self.rag.search(query, top_k)
        if result.success:
            return ToolResult(
                tool_name="summarize",
                success=True,
                data={
                    "summary": result.data.get("answer", ""),
                    "source_count": len(result.data.get("citations", [])),
                    "citations": result.data.get("citations", []),
                },
            )
        return ToolResult(tool_name="summarize", success=False, data={}, error=result.error)

    @_traceable(name="tool_extract", tags=["tools", "extract"])
    async def extract(self, query: str, fields: list[str] | None = None) -> ToolResult:
        logger.info("tool_extract", query=query, fields=fields)
        extraction_query = query
        if fields:
            extraction_query = (
                f"Extract the following specific information: {', '.join(fields)}. "
                f"Context: {query}"
            )
        result = await self.rag.search(extraction_query, top_k=5)
        if result.success:
            return ToolResult(
                tool_name="extract",
                success=True,
                data={
                    "extracted": result.data.get("answer", ""),
                    "fields_requested": fields or [],
                    "citations": result.data.get("citations", []),
                },
            )
        return ToolResult(tool_name="extract", success=False, data={}, error=result.error)
    def get_tool_descriptions(self) -> list[dict]:
        return [
            {
                "name": "search",
                "description": "Search across all documents for relevant information. Use for factual lookups and finding specific content.",
                "parameters": {
                    "query": {"type": "string", "description": "The search query"},
                    "top_k": {"type": "integer", "description": "Number of results (default 5)", "default": 5},
                },
                "required": ["query"],
            },
            {
                "name": "compare",
                "description": "Compare information from multiple queries side by side. Use when the user asks to compare, contrast, or differentiate between topics.",
                "parameters": {
                    "queries": {"type": "array", "items": {"type": "string"}, "description": "List of queries to compare"},
                    "top_k": {"type": "integer", "description": "Results per query (default 3)", "default": 3},
                },
                "required": ["queries"],
            },
            {
                "name": "summarize",
                "description": "Get a comprehensive summary with broader context. Use for overview questions or when depth is needed.",
                "parameters": {
                    "query": {"type": "string", "description": "What to summarize"},
                    "top_k": {"type": "integer", "description": "Number of source chunks (default 8)", "default": 8},
                },
                "required": ["query"],
            },
            {
                "name": "extract",
                "description": "Extract specific data points or structured information from documents. Use when user wants particular fields or data.",
                "parameters": {
                    "query": {"type": "string", "description": "Context for extraction"},
                    "fields": {"type": "array", "items": {"type": "string"}, "description": "Specific fields to extract"},
                },
                "required": ["query"],
            },
        ]