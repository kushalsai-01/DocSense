"""
Conversation memory management for agentic RAG system.
Maintains context across multiple queries in a session.
"""

from typing import List, Dict, Optional
from datetime import datetime
from pydantic import BaseModel


class Message(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str
    citations: List[Dict] = []
    timestamp: datetime = None
    
    def __init__(self, **data):
        if 'timestamp' not in data:
            data['timestamp'] = datetime.now()
        super().__init__(**data)


class ConversationMemory:
    """
    Manages conversation history for contextual question answering.
    Implements sliding window to maintain recent context.
    """
    
    def __init__(self, max_history: int = 10):
        self.messages: List[Message] = []
        self.max_history = max_history
    
    def add_user_message(self, content: str):
        """Add user query to conversation history."""
        msg = Message(role="user", content=content)
        self.messages.append(msg)
        self._trim_history()
    
    def add_assistant_message(self, content: str, citations: List[Dict] = None):
        """Add assistant response to conversation history."""
        msg = Message(
            role="assistant",
            content=content,
            citations=citations or []
        )
        self.messages.append(msg)
        self._trim_history()
    
    def get_context(self, include_last_n: int = None) -> str:
        """
        Get formatted conversation context for LLM.
        
        Args:
            include_last_n: Number of recent exchanges to include (default: all)
        
        Returns:
            Formatted conversation history
        """
        messages = self.messages
        if include_last_n:
            # Each exchange is 2 messages (user + assistant)
            messages = self.messages[-(include_last_n * 2):]
        
        context_parts = []
        for msg in messages:
            context_parts.append(f"{msg.role.upper()}: {msg.content}")
        
        return "\n".join(context_parts)
    
    def get_last_user_query(self) -> Optional[str]:
        """Get the most recent user question."""
        for msg in reversed(self.messages):
            if msg.role == "user":
                return msg.content
        return None
    
    def has_context(self) -> bool:
        """Check if conversation has any history."""
        return len(self.messages) > 0
    
    def _trim_history(self):
        """Keep only recent messages within max_history limit."""
        if len(self.messages) > self.max_history * 2:  # *2 for user+assistant pairs
            self.messages = self.messages[-(self.max_history * 2):]
    
    def clear(self):
        """Clear all conversation history."""
        self.messages.clear()
    
    def get_summary(self) -> Dict:
        """Get conversation statistics."""
        return {
            "total_messages": len(self.messages),
            "user_messages": sum(1 for m in self.messages if m.role == "user"),
            "assistant_messages": sum(1 for m in self.messages if m.role == "assistant"),
            "started_at": self.messages[0].timestamp if self.messages else None,
            "last_activity": self.messages[-1].timestamp if self.messages else None
        }


class ConversationManager:
    """
    Manages multiple conversation sessions.
    Maps session IDs to ConversationMemory instances.
    """
    
    def __init__(self):
        self.sessions: Dict[str, ConversationMemory] = {}
    
    def get_or_create_session(self, session_id: str, max_history: int = 10) -> ConversationMemory:
        """Get existing session or create new one."""
        if session_id not in self.sessions:
            self.sessions[session_id] = ConversationMemory(max_history=max_history)
        return self.sessions[session_id]
    
    def delete_session(self, session_id: str):
        """Delete a conversation session."""
        if session_id in self.sessions:
            del self.sessions[session_id]
    
    def clear_all(self):
        """Clear all sessions."""
        self.sessions.clear()
