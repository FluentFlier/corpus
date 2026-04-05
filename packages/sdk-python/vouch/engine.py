from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

from .types import PolicyResult, VouchConfig, VouchInput

BUILTIN_POLICY_DIR = str(Path(__file__).resolve().parent.parent.parent.parent / "policies" / "builtin")


def _debug(message: str, data: object = None) -> None:
    if os.environ.get("VOUCH_DEBUG") != "true":
        return
    prefix = f"[vouch {time.strftime('%Y-%m-%dT%H:%M:%S')}]"
    line = f"{prefix} {message}"
    if data is not None:
        line += f" {json.dumps(data, default=str)}"
    sys.stderr.write(line + "\n")


def load_policy_file(path: str) -> dict:
    """Load and parse a vouch.policy.yaml file."""
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Policy file not found: {path}. Run 'vouch init' to create one."
        )
    with open(path, "r") as f:
        raw = f.read()

    try:
        import yaml
        parsed = yaml.safe_load(raw)
    except ImportError:
        if path.endswith(".json"):
            parsed = json.loads(raw)
        else:
            raise ImportError(
                "PyYAML is required to load .yaml policy files. "
                "Install it with: pip install pyyaml"
            )

    if not parsed or not parsed.get("agent") or not isinstance(parsed.get("rules"), list):
        raise ValueError(
            f"Invalid policy file at {path}. Must have 'agent' and 'rules' fields."
        )
    for i, rule in enumerate(parsed["rules"]):
        if not isinstance(rule, dict) or "name" not in rule or "verdict" not in rule or "trigger" not in rule:
            raise ValueError(
                f"Invalid rule at index {i}: rules must have 'name', 'verdict', and 'trigger' fields."
            )
    return parsed


def evaluate_yaml_policies(input: VouchInput, policy: dict) -> PolicyResult:
    """Evaluate a VouchInput against YAML policy rules. First match wins."""
    for rule in policy.get("rules", []):
        if not isinstance(rule, dict):
            sys.stderr.write(f"[vouch] Warning: skipping non-dict rule: {rule}\n")
            continue
        if "name" not in rule or "verdict" not in rule or "trigger" not in rule:
            sys.stderr.write(
                f"[vouch] Warning: skipping rule missing required fields (name/verdict/trigger): {rule}\n"
            )
            continue
        if _rule_matches(rule, input):
            verdict = rule["verdict"].upper()
            return PolicyResult(
                verdict=verdict,
                block_reason=rule.get("blockReason"),
                message=rule.get("message", ""),
                policy_name=rule["name"],
                requires_confirmation=verdict == "CONFIRM",
            )

    return PolicyResult(verdict="PASS", policy_name="__no_match__")


def _rule_matches(rule: dict, input: VouchInput) -> bool:
    if not input.action_type:
        return False
    t = rule.get("trigger", {})
    action_lower = input.action_type.lower()

    # actionType: exact match
    if "actionType" in t:
        types = t["actionType"] if isinstance(t["actionType"], list) else [t["actionType"]]
        if not any(action_lower == a.lower() for a in types):
            return False

    # actionContains: substring
    if "actionContains" in t:
        needles = t["actionContains"] if isinstance(t["actionContains"], list) else [t["actionContains"]]
        if not any(n.lower() in action_lower for n in needles):
            return False

    # actionStartsWith: prefix
    if "actionStartsWith" in t:
        prefixes = t["actionStartsWith"] if isinstance(t["actionStartsWith"], list) else [t["actionStartsWith"]]
        if not any(action_lower.startswith(p.lower()) for p in prefixes):
            return False

    # contextKey checks
    if "contextKey" in t:
        ctx = input.context or {}
        ctx_value = ctx.get(t["contextKey"])
        if ctx_value is None:
            return False

        if "contextValueIn" in t:
            if ctx_value not in t["contextValueIn"]:
                return False
        if "contextValueBelow" in t:
            if not isinstance(ctx_value, (int, float)) or ctx_value >= t["contextValueBelow"]:
                return False
        if "contextValueAbove" in t:
            if not isinstance(ctx_value, (int, float)) or ctx_value <= t["contextValueAbove"]:
                return False

    # userApproved
    if "userApproved" in t:
        if input.user_approved != t["userApproved"]:
            return False

    return True


def run_jac_walker(
    jac_file: str,
    walker: str,
    args: dict,
    timeout_ms: int
) -> PolicyResult:
    """Run a Jac walker subprocess. Never throws; returns CONFIRM on error."""
    safe_default = PolicyResult(
        verdict="CONFIRM",
        message="Policy check could not complete. Confirm to proceed.",
        policy_name=f"{walker}:error",
        requires_confirmation=True,
    )

    try:
        proc = subprocess.run(
            ["jac", "run", jac_file, "--entrypoint", walker],
            input=json.dumps(args),
            capture_output=True,
            text=True,
            timeout=timeout_ms / 1000,
        )

        if proc.stderr:
            _debug(f"Jac walker {walker} stderr:", proc.stderr)

        if proc.returncode != 0:
            _debug(f"Jac walker {walker} exited with code {proc.returncode}")
            return safe_default

        result_data = json.loads(proc.stdout.strip())
        return PolicyResult(
            verdict=result_data.get("verdict", "CONFIRM"),
            block_reason=result_data.get("block_reason"),
            message=result_data.get("message", ""),
            policy_name=result_data.get("policy_name", walker),
            requires_confirmation=result_data.get("requires_confirmation", False),
        )
    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError, OSError) as e:
        _debug(f"Jac walker {walker} error: {e}")
        return safe_default


def evaluate_policies(input: VouchInput, config: VouchConfig) -> tuple[PolicyResult, int]:
    """Run all policies in sequence. Returns (result, duration_ms)."""
    start = time.monotonic_ns()
    timeout = config.policy_eval_timeout_ms

    # Load policy file
    policy = load_policy_file(config.policy_path)

    # Step 1: YAML rules
    yaml_result = evaluate_yaml_policies(input, policy)
    if yaml_result.verdict != "PASS":
        duration = int((time.monotonic_ns() - start) / 1_000_000)
        return yaml_result, duration

    # Step 2: Action safety
    safety_result = run_jac_walker(
        os.path.join(BUILTIN_POLICY_DIR, "action_safety.jac"),
        "CheckActionSafety",
        {"action_type": input.action_type, "user_approved": input.user_approved},
        timeout,
    )
    if safety_result.verdict != "PASS":
        duration = int((time.monotonic_ns() - start) / 1_000_000)
        return safety_result, duration

    # Step 3: Scope guard
    allowed = policy.get("allowedActions", [])
    if allowed:
        scope_result = run_jac_walker(
            os.path.join(BUILTIN_POLICY_DIR, "scope_guard.jac"),
            "CheckScope",
            {
                "action_type": input.action_type,
                "allowed_actions": allowed,
                "intent_context": str((input.context or {}).get("intent", "")),
            },
            timeout,
        )
        if scope_result.verdict != "PASS":
            duration = int((time.monotonic_ns() - start) / 1_000_000)
            return scope_result, duration

    # Step 4: Rate guard
    rate_limits = policy.get("rateLimits", {})
    limit = rate_limits.get(input.action_type) or rate_limits.get("*")
    if limit:
        rate_result = run_jac_walker(
            os.path.join(BUILTIN_POLICY_DIR, "rate_guard.jac"),
            "CheckRateLimit",
            {
                "action_type": input.action_type,
                "limit": limit["count"],
                "window_seconds": limit["windowSeconds"],
                "current_epoch": int(time.time()),
            },
            timeout,
        )
        if rate_result.verdict != "PASS":
            duration = int((time.monotonic_ns() - start) / 1_000_000)
            return rate_result, duration

    # Step 5: Custom Jac extension
    jac_ext = policy.get("jacExtension")
    if jac_ext:
        custom_result = run_jac_walker(
            jac_ext,
            "CheckCustom",
            {"action_type": input.action_type, "context": input.context or {}},
            timeout,
        )
        if custom_result.verdict != "PASS":
            duration = int((time.monotonic_ns() - start) / 1_000_000)
            return custom_result, duration

    duration = int((time.monotonic_ns() - start) / 1_000_000)
    return PolicyResult(verdict="PASS", policy_name="__pass__"), duration
