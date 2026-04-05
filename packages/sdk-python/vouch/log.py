from __future__ import annotations

import json
import os
import sys
import time
import uuid
from typing import Optional

from .types import ActionLogEntry, PolicyResult, VouchConfig, VouchInput


def build_log_entry(
    input: VouchInput,
    result: PolicyResult,
    verdict: str,
    user_decision: Optional[str],
    project_slug: str,
    duration_ms: int,
) -> ActionLogEntry:
    return ActionLogEntry(
        id=str(uuid.uuid4()),
        project_slug=project_slug,
        action_type=input.action_type,
        verdict=verdict,
        user_decision=user_decision,
        policy_triggered=result.policy_name,
        block_reason=result.block_reason,
        duration_ms=duration_ms,
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )


def send_log_entry(entry: ActionLogEntry, config: VouchConfig) -> None:
    """Fire-and-forget log sender. Never raises."""
    try:
        import threading

        def _send() -> None:
            try:
                endpoint = config.api_endpoint
                if not (
                    endpoint.startswith("https://")
                    or endpoint.startswith("http://localhost")
                    or endpoint.startswith("http://127.0.0.1")
                ):
                    sys.stderr.write(
                        f"[vouch] Warning: api_endpoint '{endpoint}' is not using HTTPS. "
                        "Consider using https:// for production.\n"
                    )
                url = f"{endpoint}/api/ingest"
                payload = json.dumps({
                    "id": entry.id,
                    "projectSlug": entry.project_slug,
                    "actionType": entry.action_type,
                    "verdict": entry.verdict,
                    "userDecision": entry.user_decision,
                    "policyTriggered": entry.policy_triggered,
                    "blockReason": entry.block_reason,
                    "durationMs": entry.duration_ms,
                    "timestamp": entry.timestamp,
                }).encode("utf-8")

                try:
                    import requests
                    requests.post(
                        url,
                        data=payload,
                        headers={
                            "Content-Type": "application/json",
                            "x-vouch-key": config.api_key,
                        },
                        timeout=5,
                    )
                except ImportError:
                    from urllib.request import Request, urlopen
                    req = Request(url, data=payload, method="POST")
                    req.add_header("Content-Type", "application/json")
                    req.add_header("x-vouch-key", config.api_key)
                    urlopen(req, timeout=5)
            except Exception:
                if os.environ.get("VOUCH_DEBUG") == "true":
                    import traceback
                    sys.stderr.write(f"[vouch] Failed to send log: {traceback.format_exc()}\n")

        t = threading.Thread(target=_send, daemon=True)
        t.start()
    except Exception:
        pass
