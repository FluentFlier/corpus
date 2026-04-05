# vouch-sdk

Runtime behavioral safety for AI agents. Define what your agent can do, enforce it at runtime, prove it publicly.

## Install

```bash
npm install vouch-sdk
```

## Usage

```typescript
import { createVouch } from 'vouch-sdk';

const vouch = createVouch({
  projectSlug: 'my-agent',
  apiEndpoint: 'https://vouch.run',
  apiKey: process.env.VOUCH_API_KEY!,
  mode: 'observe',
  policyPath: './vouch.policy.yaml',
});

const result = await vouch.protect(
  { actionType: 'send_email', context: { confidence: 0.9 } },
  () => emailClient.send(to, subject, body),
  undefined,
  { onBlocked: (msg) => console.error(msg) }
);
```

See the [main README](../../README.md) for full documentation.
