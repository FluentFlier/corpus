from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Awaitable, Literal, Optional

Verdict = Literal['PASS', 'BLOCK', 'CONFIRM']

BlockReason = Literal[
    'DESTRUCTIVE_ACTION',
    'AUTO_SEND',
    'EXTERNAL_WRITE',
    'SCOPE_VIOLATION',
    'LOW_CONFIDENCE',
    'RATE_EXCEEDED',
    'UNKNOWN_ACTION',
    'CUSTOM',
]


@dataclass
class PolicyResult:
    verdict: Verdict
    block_reason: Optional[BlockReason] = None
    message: str = ""
    policy_name: str = ""
    requires_confirmation: bool = False


@dataclass
class VouchInput:
    action_type: str
    action_payload: Optional[dict] = None
    context: Optional[dict] = None
    user_approved: bool = False


@dataclass
class ActionLogEntry:
    id: str
    project_slug: str
    action_type: str
    verdict: Verdict
    user_decision: Optional[Literal['CONFIRMED', 'CANCELLED']]
    policy_triggered: str
    block_reason: Optional[BlockReason]
    duration_ms: int
    timestamp: str


@dataclass
class VouchConfig:
    project_slug: str
    api_endpoint: str
    api_key: str
    mode: Literal['observe', 'enforce'] = 'observe'
    policy_path: str = './vouch.policy.yaml'
    confidence_block: float = 0.50
    confidence_confirm: float = 0.72
    policy_eval_timeout_ms: int = 200
    undo_window_ms: int = 5000


@dataclass
class VouchHooks:
    on_confirm_required: Optional[Callable] = None
    on_blocked: Optional[Callable] = None
    on_undo_available: Optional[Callable] = None
    on_policy_eval_complete: Optional[Callable] = None


class VouchBlockedError(Exception):
    def __init__(self, policy_name: str, block_reason: Optional[BlockReason], message: str) -> None:
        super().__init__(f"[vouch] Policy '{policy_name}' blocked this action: {message}")
        self.policy_name = policy_name
        self.block_reason = block_reason


class VouchConfigError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(f"[vouch] Config error: {message}")
