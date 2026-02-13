from typing import List, Dict, Optional
from datetime import datetime
from pydantic import BaseModel
class Message(BaseModel):
    role: str
    content: str
    citations: List[Dict] = []
    timestamp: datetime = None
    def __init__(self, **data):
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now()
        super().__init__(**data)
class ConversationMemory:
    def __init__(self, max_history: int = 10):
        self.messages: List[Message] = []
        self.max_history = max_history
    def add_user_message(self, content: str):
        msg = Message(role="user", content=content)
        self.messages.append(msg)
        self._trim_history()
    def add_assistant_message(self, content: str, citations: List[Dict] = None):
        msg = Message(
            role="assistant",
            content=content,
            citations=citations or []
        )
        self.messages.append(msg)
        self._trim_history()
    def get_context(self, include_last_n: int = None) -> str:
        messages = self.messages
        if include_last_n:
            messages = self.messages[-(include_last_n * 2):]
        context_parts = []
        for msg in messages:
            context_parts.append(f"{msg.role.upper()}: {msg.content}")
        return "\n".join(context_parts)
    def get_last_user_query(self) -> Optional[str]:
        for msg in reversed(self.messages):
            if msg.role == "user":
                return msg.content
        return None
    def has_context(self) -> bool:
        return len(self.messages) > 0
    def _trim_history(self):
        if len(self.messages) > self.max_history * 2:
            self.messages = self.messages[-(self.max_history * 2):]
    def clear(self):
        self.messages.clear()
    def get_summary(self) -> Dict:
        return {
            "total_messages": len(self.messages),
            "user_messages": sum(1 for m in self.messages if m.role == "user"),
            "assistant_messages": sum(1 for m in self.messages if m.role == "assistant"),
            "started_at": self.messages[0].timestamp if self.messages else None,
            "last_activity": self.messages[-1].timestamp if self.messages else None
        }
class ConversationManager:
    def __init__(self):
        self.sessions: Dict[str, ConversationMemory] = {}
    def get_or_create_session(self, session_id: str, max_history: int = 10) -> ConversationMemory:
        if session_id not in self.sessions:
            self.sessions[session_id] = ConversationMemory(max_history=max_history)
        return self.sessions[session_id]
    def delete_session(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]
    def clear_all(self):
        self.sessions.clear()
