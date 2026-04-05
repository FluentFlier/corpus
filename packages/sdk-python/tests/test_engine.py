import unittest

from vouch.engine import evaluate_yaml_policies, _rule_matches
from vouch.types import VouchInput, PolicyResult


class TestYamlEvaluator(unittest.TestCase):

    def test_no_rules_returns_pass(self):
        result = evaluate_yaml_policies(
            VouchInput(action_type="anything"),
            {"agent": "test", "rules": []},
        )
        self.assertEqual(result.verdict, "PASS")

    def test_action_type_match(self):
        policy = {
            "agent": "test",
            "rules": [{
                "name": "block_delete",
                "verdict": "BLOCK",
                "message": "no deletes",
                "trigger": {"actionType": "delete_file"},
            }],
        }
        result = evaluate_yaml_policies(
            VouchInput(action_type="delete_file"), policy
        )
        self.assertEqual(result.verdict, "BLOCK")

    def test_action_starts_with(self):
        policy = {
            "agent": "test",
            "rules": [{
                "name": "confirm_send",
                "verdict": "CONFIRM",
                "message": "confirm",
                "trigger": {"actionStartsWith": ["send_"]},
            }],
        }
        result = evaluate_yaml_policies(
            VouchInput(action_type="send_email"), policy
        )
        self.assertEqual(result.verdict, "CONFIRM")

    def test_action_contains(self):
        policy = {
            "agent": "test",
            "rules": [{
                "name": "block_prod",
                "verdict": "BLOCK",
                "message": "no prod",
                "trigger": {"actionContains": ["prod"]},
            }],
        }
        result = evaluate_yaml_policies(
            VouchInput(action_type="write_to_prod"), policy
        )
        self.assertEqual(result.verdict, "BLOCK")

    def test_context_value_below(self):
        policy = {
            "agent": "test",
            "rules": [{
                "name": "low_conf",
                "verdict": "BLOCK",
                "message": "too low",
                "trigger": {"contextKey": "confidence", "contextValueBelow": 0.5},
            }],
        }
        result = evaluate_yaml_policies(
            VouchInput(action_type="act", context={"confidence": 0.3}), policy
        )
        self.assertEqual(result.verdict, "BLOCK")

        result2 = evaluate_yaml_policies(
            VouchInput(action_type="act", context={"confidence": 0.8}), policy
        )
        self.assertEqual(result2.verdict, "PASS")

    def test_context_value_in(self):
        policy = {
            "agent": "test",
            "rules": [{
                "name": "angry",
                "verdict": "CONFIRM",
                "message": "user angry",
                "trigger": {"contextKey": "sentiment", "contextValueIn": ["angry"]},
            }],
        }
        result = evaluate_yaml_policies(
            VouchInput(action_type="respond", context={"sentiment": "angry"}), policy
        )
        self.assertEqual(result.verdict, "CONFIRM")

    def test_case_insensitive(self):
        policy = {
            "agent": "test",
            "rules": [{
                "name": "block",
                "verdict": "BLOCK",
                "message": "blocked",
                "trigger": {"actionType": "DELETE_FILE"},
            }],
        }
        result = evaluate_yaml_policies(
            VouchInput(action_type="delete_file"), policy
        )
        self.assertEqual(result.verdict, "BLOCK")

    def test_first_match_wins(self):
        policy = {
            "agent": "test",
            "rules": [
                {"name": "first", "verdict": "BLOCK", "message": "first",
                 "trigger": {"actionType": "test"}},
                {"name": "second", "verdict": "CONFIRM", "message": "second",
                 "trigger": {"actionType": "test"}},
            ],
        }
        result = evaluate_yaml_policies(
            VouchInput(action_type="test"), policy
        )
        self.assertEqual(result.policy_name, "first")


if __name__ == "__main__":
    unittest.main()
