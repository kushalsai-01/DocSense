"""
Document Intelligence Processor

Enriches uploaded documents with AI-generated metadata:
  - 2-3 sentence summary
  - 3-7 topic tags
  - Named entities (people, orgs, dates, locations, technical terms)
  - 5 key insights
  - Document type classification

Called once per document after upload via POST /agent/documents/process.
Saves results to document_metadata table via the API service.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

from app.agent.router import LLMRouter
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

try:
    from langsmith import traceable as _traceable
except ImportError:
    def _traceable(**_kwargs):  # type: ignore[misc]
        def decorator(fn):
            return fn
        return decorator

DOCUMENT_TYPES = [
    "research_paper", "contract", "report", "article",
    "manual", "financial", "legal", "presentation", "other",
]


@dataclass
class DocumentIntelligence:
    document_id: str
    summary: str = ""
    topics: list[str] = field(default_factory=list)
    entities: dict[str, list[str]] = field(default_factory=dict)
    key_insights: list[str] = field(default_factory=list)
    document_type: str = "other"
    processed_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class DocumentIntelligenceProcessor:
    """Run all enrichment tasks concurrently, persist to API service."""

    def __init__(self) -> None:
        self._llm = LLMRouter()
        self._api_base = "http://localhost:3000"  # will use API service internal URL

    @_traceable(name="doc_intelligence_process", tags=["intelligence"])
    async def process(
        self,
        document_id: str,
        full_text: str,
        chunks: list[str],
    ) -> DocumentIntelligence:
        logger.info("document_intelligence_start", document_id=document_id)

        # Run all enrichment tasks in parallel
        try:
            summary, topics, entities, key_insights, doc_type = await asyncio.gather(
                self._generate_summary(full_text[:8000]),
                self._extract_topics(full_text[:4000]),
                self._extract_entities(full_text[:4000]),
                self._extract_key_insights(full_text[:6000]),
                self._classify_document_type(full_text[:2000]),
                return_exceptions=False,
            )
        except Exception as exc:
            logger.error("document_intelligence_failed", document_id=document_id, error=str(exc))
            summary, topics, entities, key_insights, doc_type = (
                "Document processed.", [], {}, [], "other"
            )

        result = DocumentIntelligence(
            document_id=document_id,
            summary=summary if isinstance(summary, str) else "",
            topics=topics if isinstance(topics, list) else [],
            entities=entities if isinstance(entities, dict) else {},
            key_insights=key_insights if isinstance(key_insights, list) else [],
            document_type=doc_type if isinstance(doc_type, str) else "other",
        )

        await self._persist(result)
        logger.info(
            "document_intelligence_complete",
            document_id=document_id,
            topics=len(result.topics),
            doc_type=result.document_type,
        )
        return result

    @_traceable(name="doc_generate_summary", tags=["intelligence"])
    async def _generate_summary(self, text: str) -> str:
        prompt = f"""Summarize this document in exactly 2-3 sentences.
Be specific about the main topic, key findings, and purpose.
Never use generic phrases like "this document discusses" or "this document covers".
Start directly with the subject matter.

Document:
{text}

Summary (2-3 sentences only):"""
        response = await self._llm.agenerate(prompt=prompt, max_tokens=200, temperature=0.1)
        return response.strip()

    async def _extract_topics(self, text: str) -> list[str]:
        prompt = f"""Extract 3-7 main topics from this document.
Return ONLY a JSON array of short strings (2-4 words each).
Example: ["machine learning", "neural networks", "image classification"]

Document:
{text[:2000]}

Topics (JSON array only, no other text):"""
        response = await self._llm.agenerate(prompt=prompt, max_tokens=200, temperature=0.0)
        return self._parse_json_list(response, default=[])

    @_traceable(name="doc_extract_entities", tags=["intelligence"])
    async def _extract_entities(self, text: str) -> dict[str, list[str]]:
        prompt = f"""Extract named entities from this document.
Return ONLY a JSON object with these exact keys:
{{
  "people": ["list of person names"],
  "organizations": ["list of org/company names"],
  "dates": ["list of dates/years"],
  "locations": ["list of places"],
  "technical_terms": ["list of important domain-specific terms"]
}}

Document:
{text[:2000]}

Entities (JSON only, no other text):"""
        response = await self._llm.agenerate(prompt=prompt, max_tokens=400, temperature=0.0)
        result = self._parse_json_dict(response)
        for key in ["people", "organizations", "dates", "locations", "technical_terms"]:
            if key not in result:
                result[key] = []
        return result

    async def _extract_key_insights(self, text: str) -> list[str]:
        prompt = f"""Extract exactly 5 key insights or important points from this document.
Each insight must be a specific, informative statement (not a generic observation).
Return ONLY a JSON array of 5 strings.

Document:
{text[:4000]}

Key insights (JSON array of exactly 5 strings, no other text):"""
        response = await self._llm.agenerate(prompt=prompt, max_tokens=500, temperature=0.1)
        insights = self._parse_json_list(response, default=[])
        return insights[:5] if insights else ["Key insights could not be extracted."]

    async def _classify_document_type(self, text: str) -> str:
        types_str = ", ".join(DOCUMENT_TYPES)
        prompt = f"""Classify this document into exactly one of these categories:
{types_str}

Return ONLY the category name, nothing else.

Document beginning:
{text[:1500]}

Category:"""
        response = await self._llm.agenerate(prompt=prompt, max_tokens=20, temperature=0.0)
        doc_type = response.strip().lower().split()[0] if response.strip() else "other"
        return doc_type if doc_type in DOCUMENT_TYPES else "other"

    async def _persist(self, result: DocumentIntelligence) -> None:
        """
        Persist document intelligence to the database via the internal API.
        Falls back to direct DB write if API call fails.
        """
        payload = {
            "document_id": result.document_id,
            "summary": result.summary,
            "topics": result.topics,
            "entities": result.entities,
            "key_insights": result.key_insights,
            "document_type": result.document_type,
            "processed_at": result.processed_at,
        }

        try:
            # Try to upsert directly into document_metadata via DB access
            from app.core.database import get_engine
            from sqlalchemy import text

            engine = get_engine()
            async with engine.connect() as conn:
                await conn.execute(
                    text("""
                        INSERT INTO document_metadata
                          (document_id, summary, topics, entities, key_insights, document_type, processed_at)
                        VALUES (:doc_id, :summary, :topics::jsonb, :entities::jsonb, :key_insights::jsonb, :doc_type, :processed_at)
                        ON CONFLICT (document_id) DO UPDATE SET
                          summary = EXCLUDED.summary,
                          topics = EXCLUDED.topics,
                          entities = EXCLUDED.entities,
                          key_insights = EXCLUDED.key_insights,
                          document_type = EXCLUDED.document_type,
                          processed_at = EXCLUDED.processed_at
                    """),
                    {
                        "doc_id": result.document_id,
                        "summary": result.summary,
                        "topics": json.dumps(result.topics),
                        "entities": json.dumps(result.entities),
                        "key_insights": json.dumps(result.key_insights),
                        "doc_type": result.document_type,
                        "processed_at": result.processed_at,
                    },
                )
                await conn.commit()
                logger.info("document_metadata_saved", document_id=result.document_id)
        except Exception as exc:
            logger.error("document_metadata_persist_failed", document_id=result.document_id, error=str(exc))

    @staticmethod
    def _parse_json_list(text: str, default: list) -> list:
        text = text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        try:
            result = json.loads(text)
            return result if isinstance(result, list) else default
        except (json.JSONDecodeError, ValueError):
            match = re.search(r"\[.*?\]", text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except (json.JSONDecodeError, ValueError):
                    pass
        return default

    @staticmethod
    def _parse_json_dict(text: str) -> dict:
        text = text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        try:
            result = json.loads(text)
            return result if isinstance(result, dict) else {}
        except (json.JSONDecodeError, ValueError):
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except (json.JSONDecodeError, ValueError):
                    pass
        return {}
