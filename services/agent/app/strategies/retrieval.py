from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
from app.core.logging import get_logger
logger = get_logger(__name__)
class RetrievalMode(str, Enum):
    SEMANTIC = "semantic"       # Standard vector similarity
    KEYWORD = "keyword"         # Keyword-boosted retrieval
    HYBRID = "hybrid"           # Combination of semantic + keyword
    MULTI_HOP = "multi_hop"    # Chain of retrievals for complex queries
    EXHAUSTIVE = "exhaustive"   # High top_k for comprehensive coverage
@dataclass
class RetrievalConfig:
    mode: RetrievalMode
    top_k: int
    score_threshold: float
    rerank: bool
    reasoning: str
    def to_dict(self) -> dict:
        return {
            "mode": self.mode.value,
            "top_k": self.top_k,
            "score_threshold": self.score_threshold,
            "rerank": self.rerank,
            "reasoning": self.reasoning,
        }
class RetrievalStrategySelector:
    def select(self, query: str, strategy: str = "direct") -> RetrievalConfig:
        q_lower = query.lower()
        word_count = len(query.split())
        if strategy == "compare":
            return RetrievalConfig(
                mode=RetrievalMode.MULTI_HOP,
                top_k=3,
                score_threshold=0.3,
                rerank=True,
                reasoning="Comparison query — multi-hop retrieval with per-topic search",
            )
        if strategy == "summarize" or any(w in q_lower for w in ["summarize", "overview", "explain"]):
            return RetrievalConfig(
                mode=RetrievalMode.EXHAUSTIVE,
                top_k=10,
                score_threshold=0.2,
                rerank=True,
                reasoning="Summary query — exhaustive retrieval for comprehensive coverage",
            )
        if strategy == "extract":
            return RetrievalConfig(
                mode=RetrievalMode.HYBRID,
                top_k=5,
                score_threshold=0.35,
                rerank=True,
                reasoning="Extraction query — hybrid retrieval with reranking for precision",
            )
        if word_count <= 8:
            return RetrievalConfig(
                mode=RetrievalMode.SEMANTIC,
                top_k=5,
                score_threshold=0.4,
                rerank=False,
                reasoning="Short factual query — direct semantic search",
            )
        return RetrievalConfig(
            mode=RetrievalMode.SEMANTIC,
            top_k=5,
            score_threshold=0.3,
            rerank=True,
            reasoning="Standard query — semantic search with reranking",
        )
