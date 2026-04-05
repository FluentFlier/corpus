from __future__ import annotations

from typing import TypeVar, Callable, Awaitable, Optional

from .types import VouchConfig, VouchInput, VouchHooks, PolicyResult, VouchBlockedError, VouchConfigError
from .engine import evaluate_policies
from .log import send_log_entry, build_log_entry

T = TypeVar('T')


class VouchClient:
    """
    Runtime behavioral safety for AI agents.

    Usage:
        vouch = VouchClient(VouchConfig(
            project_slug='my-agent',
            api_endpoint='https://vouch.run',
            api_key='vouch_...',
            mode='observe',
            policy_path='./vouch.policy.yaml',
        ))

        result = await vouch.protect(
            VouchInput(action_type='send_email', context={'confidence': 0.9}),
            lambda: send_email(to, subject, body),
            hooks=VouchHooks(on_blocked=lambda msg, r: print(f'Blocked: {msg}')),
        )
    """

    def __init__(self, config: VouchConfig) -> None:
        if not config.project_slug:
            raise VouchConfigError('project_slug is required')
        if not config.policy_path:
            raise VouchConfigError('policy_path is required')
        self.config = config

    async def protect(
        self,
        input: VouchInput,
        execute_fn: Callable[[], Awaitable[T]],
        undo_fn: Optional[Callable[[], Awaitable[None]]] = None,
        hooks: Optional[VouchHooks] = None,
    ) -> Optional[T]:
        if not input or not input.action_type:
            raise VouchConfigError('input.action_type is required')

        hooks = hooks or VouchHooks()
        result, duration_ms = evaluate_policies(input, self.config)

        if hooks.on_policy_eval_complete:
            hooks.on_policy_eval_complete(result, duration_ms)

        if result.verdict == 'BLOCK':
            send_log_entry(
                build_log_entry(input, result, 'BLOCK', None, self.config.project_slug, duration_ms),
                self.config
            )
            if self.config.mode == 'enforce':
                if hooks.on_blocked:
                    hooks.on_blocked(result.message, result.block_reason)
                raise VouchBlockedError(result.policy_name, result.block_reason, result.message)
            return await execute_fn()

        if result.verdict == 'CONFIRM':
            if self.config.mode == 'enforce' and hooks.on_confirm_required:
                import asyncio
                confirmed = asyncio.get_running_loop().create_future()

                def do_confirm() -> None:
                    confirmed.set_result(True)

                def do_cancel() -> None:
                    confirmed.set_result(False)

                hooks.on_confirm_required(result.message, do_confirm, do_cancel)
                user_confirmed = await confirmed

                if user_confirmed:
                    send_log_entry(
                        build_log_entry(input, result, 'CONFIRM', 'CONFIRMED', self.config.project_slug, duration_ms),
                        self.config
                    )
                    return await execute_fn()
                else:
                    send_log_entry(
                        build_log_entry(input, result, 'CONFIRM', 'CANCELLED', self.config.project_slug, duration_ms),
                        self.config
                    )
                    return None

            # Observe mode or no confirm hook: log and execute
            send_log_entry(
                build_log_entry(input, result, 'CONFIRM', 'CONFIRMED', self.config.project_slug, duration_ms),
                self.config
            )
            return await execute_fn()

        # PASS
        send_log_entry(
            build_log_entry(input, result, 'PASS', None, self.config.project_slug, duration_ms),
            self.config
        )
        return await execute_fn()


def create_vouch(config: VouchConfig) -> VouchClient:
    return VouchClient(config)
