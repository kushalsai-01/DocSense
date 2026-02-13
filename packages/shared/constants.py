"""
DocSense Shared Package.

Common constants and type definitions shared across services.
"""

# Service names
SERVICE_API = "api"
SERVICE_RAG = "rag"
SERVICE_AGENT = "agent"
SERVICE_WEB = "web"

# Document statuses
DOC_STATUS_PENDING = "pending"
DOC_STATUS_PROCESSING = "processing"
DOC_STATUS_READY = "ready"
DOC_STATUS_ERROR = "error"

# Conversation statuses
CONV_STATUS_ACTIVE = "active"
CONV_STATUS_ARCHIVED = "archived"

# Agent action types
ACTION_PLAN = "plan"
ACTION_THINK = "think"
ACTION_ACT = "act"
ACTION_OBSERVE = "observe"
ACTION_EVALUATE = "evaluate"
ACTION_SYNTHESIZE = "synthesize"

# Agent strategies
STRATEGY_DIRECT = "direct"
STRATEGY_DECOMPOSE = "decompose"
STRATEGY_COMPARE = "compare"
STRATEGY_SUMMARIZE = "summarize"
STRATEGY_EXTRACT = "extract"

# Agent tools
TOOL_SEARCH = "search"
TOOL_COMPARE = "compare"
TOOL_SUMMARIZE = "summarize"
TOOL_EXTRACT = "extract"

# Quality levels
QUALITY_GOOD = "good"
QUALITY_ACCEPTABLE = "acceptable"
QUALITY_POOR = "poor"
