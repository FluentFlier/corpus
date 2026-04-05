# vouch-sdk (Python)

Runtime behavioral safety for AI agents. Define what your agent can do, enforce it at runtime, prove it publicly.

## Install

```bash
pip install vouch-sdk
```

## Usage

```python
from vouch import create_vouch, VouchConfig, VouchInput

vouch = create_vouch(VouchConfig(
    project_slug='my-agent',
    api_endpoint='https://vouch.run',
    api_key='vouch_...',
    mode='observe',
    policy_path='./vouch.policy.yaml',
))

result = await vouch.protect(
    VouchInput(action_type='send_email', context={'confidence': 0.9}),
    execute_fn=lambda: send_email(to, subject, body),
)
```

See the [main README](../../README.md) for full documentation.
