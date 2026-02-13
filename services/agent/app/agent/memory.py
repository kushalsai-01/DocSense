from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logging import get_logger
logger = get_logger(__name__)
class ConversationMemory:
    def __init__(self, session: AsyncSession):
        self._db = session
    async def get_or_create_conversation(
        self, session_id: str, user_id: str | None = None
    ) -> dict:
        result = await self._db.execute(
            text("SELECT id, session_id, user_id, created_at FROM conversations WHERE session_id = :sid"),
            {"sid": session_id},
        )
        row = result.fetchone()
        if row:
            return {"id": str(row.id), "session_id": row.session_id, "user_id": row.user_id}
        conv_id = str(uuid.uuid4())
        await self._db.execute(
            text(
                "INSERT INTO conversations (id, session_id, user_id) "
                "VALUES (:id, :sid, :uid)"
            ),
            {"id": conv_id, "sid": session_id, "uid": user_id},
        )
        await self._db.flush()
        logger.info("conversation_created", session_id=session_id, conversation_id=conv_id)
        return {"id": conv_id, "session_id": session_id, "user_id": user_id}
    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        citations: list[dict] | None = None,
        metadata: dict | None = None,
    ) -> str:
        import json
        msg_id = str(uuid.uuid4())
        await self._db.execute(
            text(
                "INSERT INTO messages (id, conversation_id, role, content, citations, metadata) "
                "VALUES (:id, :cid, :role, :content, :citations, :metadata)"
            ),
            {
                "id": msg_id,
                "cid": conversation_id,
                "role": role,
                "content": content,
                "citations": json.dumps(citations or []),
                "metadata": json.dumps(metadata or {}),
            },
        )
        return msg_id
    async def get_context(
        self, conversation_id: str, last_n: int = 10
    ) -> str:
        result = await self._db.execute(
            text(
                "SELECT role, content FROM messages "
                "WHERE conversation_id = :cid "
                "ORDER BY created_at DESC "
                "LIMIT :limit"
            ),
            {"cid": conversation_id, "limit": last_n * 2},
        )
        rows = result.fetchall()
        if not rows:
            return ""
        lines = [f"{row.role.upper()}: {row.content}" for row in reversed(rows)]
        return "\n".join(lines)
    async def get_conversation_summary(self, conversation_id: str) -> dict:
        result = await self._db.execute(
            text(
                "SELECT "
                "  COUNT(*) as total, "
                "  COUNT(*) FILTER (WHERE role = 'user') as user_msgs, "
                "  COUNT(*) FILTER (WHERE role = 'assistant') as assistant_msgs, "
                "  MIN(created_at) as started_at, "
                "  MAX(created_at) as last_activity "
                "FROM messages WHERE conversation_id = :cid"
            ),
            {"cid": conversation_id},
        )
        row = result.fetchone()
        return {
            "total_messages": row.total,
            "user_messages": row.user_msgs,
            "assistant_messages": row.assistant_msgs,
            "started_at": str(row.started_at) if row.started_at else None,
            "last_activity": str(row.last_activity) if row.last_activity else None,
        }
class ActionLogger:
    def __init__(self, session: AsyncSession):
        self._db = session
    async def log_action(
        self,
        conversation_id: str | None,
        action_type: str,
        tool_name: str | None,
        input_data: dict | None,
        output_data: dict | str | None,
        duration_ms: int = 0,
        success: bool = True,
        error: str | None = None,
    ) -> str:
        import json
        action_id = str(uuid.uuid4())
        await self._db.execute(
            text(
                "INSERT INTO agent_actions "
                "(id, conversation_id, action_type, tool_name, input_data, output_data, "
                " duration_ms, success, error) "
                "VALUES (:id, :cid, :atype, :tool, :inp, :out, :dur, :ok, :err)"
            ),
            {
                "id": action_id,
                "cid": conversation_id,
                "atype": action_type,
                "tool": tool_name,
                "inp": json.dumps(input_data or {}),
                "out": json.dumps(output_data if isinstance(output_data, (dict, list)) else {"text": str(output_data or "")}),
                "dur": duration_ms,
                "ok": success,
                "err": error,
            },
        )
        return action_id
    async def log_agent_trace(
        self, conversation_id: str | None, steps: list[dict]
    ) -> list[str]:
        action_ids = []
        for step in steps:
            aid = await self.log_action(
                conversation_id=conversation_id,
                action_type=step.get("phase", "unknown"),
                tool_name=step.get("tool"),
                input_data=step.get("tool_input"),
                output_data=step.get("tool_output"),
                duration_ms=step.get("duration_ms", 0),
                success=True,
            )
            action_ids.append(aid)
        return action_ids
    async def get_actions(
        self, conversation_id: str, limit: int = 50
    ) -> list[dict]:
        result = await self._db.execute(
            text(
                "SELECT id, action_type, tool_name, input_data, output_data, "
                "       duration_ms, success, error, created_at "
                "FROM agent_actions "
                "WHERE conversation_id = :cid "
                "ORDER BY created_at DESC LIMIT :limit"
            ),
            {"cid": conversation_id, "limit": limit},
        )
        return [
            {
                "id": str(row.id),
                "action_type": row.action_type,
                "tool_name": row.tool_name,
                "duration_ms": row.duration_ms,
                "success": row.success,
                "error": row.error,
                "created_at": str(row.created_at),
            }
            for row in result.fetchall()
        ]