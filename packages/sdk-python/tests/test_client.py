import asyncio
import unittest
from unittest.mock import patch, MagicMock

from vouch.client import VouchClient, create_vouch
from vouch.types import VouchConfig, VouchInput, VouchHooks, PolicyResult, VouchBlockedError


async def make_async(value):
    return value


def make_config(mode="observe"):
    return VouchConfig(
        project_slug="test-agent",
        api_endpoint="https://vouch.run",
        api_key="vouch_test",
        mode=mode,
        policy_path="./test.yaml",
    )


def async_test(coro):
    def wrapper(*args, **kwargs):
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro(*args, **kwargs))
        finally:
            loop.close()
    return wrapper


class TestVouchClient(unittest.TestCase):

    def test_create_vouch_returns_client(self):
        config = make_config()
        client = create_vouch(config)
        self.assertIsInstance(client, VouchClient)

    def test_missing_project_slug_raises(self):
        config = make_config()
        config.project_slug = ""
        with self.assertRaises(Exception):
            VouchClient(config)

    @async_test
    @patch("vouch.client.evaluate_policies")
    @patch("vouch.client.send_log_entry")
    async def test_observe_mode_never_raises_on_block(self, mock_send, mock_eval):
        mock_eval.return_value = (
            PolicyResult(verdict="BLOCK", block_reason="DESTRUCTIVE_ACTION",
                        message="Blocked", policy_name="test"),
            5,
        )

        config = make_config(mode="observe")
        client = VouchClient(config)
        result = await client.protect(
            VouchInput(action_type="delete_file"),
            execute_fn=lambda: make_async("executed"),
        )
        # In observe mode, execute_fn runs even on BLOCK
        self.assertEqual(result, "executed")

    @async_test
    @patch("vouch.client.evaluate_policies")
    @patch("vouch.client.send_log_entry")
    async def test_enforce_mode_raises_on_block(self, mock_send, mock_eval):
        mock_eval.return_value = (
            PolicyResult(verdict="BLOCK", block_reason="DESTRUCTIVE_ACTION",
                        message="Blocked", policy_name="test"),
            5,
        )

        config = make_config(mode="enforce")
        client = VouchClient(config)
        with self.assertRaises(VouchBlockedError):
            await client.protect(
                VouchInput(action_type="delete_file"),
                execute_fn=lambda: make_async("executed"),
            )

    @async_test
    @patch("vouch.client.evaluate_policies")
    @patch("vouch.client.send_log_entry")
    async def test_execute_fn_called_on_pass(self, mock_send, mock_eval):
        mock_eval.return_value = (
            PolicyResult(verdict="PASS", policy_name="__pass__"),
            2,
        )

        config = make_config()
        client = VouchClient(config)
        called = False

        async def execute():
            nonlocal called
            called = True
            return "done"

        result = await client.protect(
            VouchInput(action_type="read_file"),
            execute_fn=execute,
        )
        self.assertTrue(called)
        self.assertEqual(result, "done")


class TestEngine(unittest.TestCase):

    @patch("vouch.engine.load_policy_file")
    def test_yaml_block_stops_evaluation(self, mock_load):
        from vouch.engine import evaluate_policies

        mock_load.return_value = {
            "agent": "test",
            "rules": [{
                "name": "block_all",
                "verdict": "BLOCK",
                "message": "blocked",
                "trigger": {"actionType": "test"},
            }],
        }

        config = make_config()
        result, duration = evaluate_policies(
            VouchInput(action_type="test"), config
        )
        self.assertEqual(result.verdict, "BLOCK")
        self.assertEqual(result.policy_name, "block_all")


if __name__ == "__main__":
    unittest.main()
