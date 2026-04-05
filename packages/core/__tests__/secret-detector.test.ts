import { describe, it, expect } from 'vitest';
import { detectSecrets } from '../src/scanners/secret-detector.js';
import { checkCodeSafety } from '../src/scanners/code-safety.js';

describe('detectSecrets', () => {
  it('detects AWS access keys', () => {
    const content = 'const key = "AKIAIOSFODNN7EXAMPLE";';
    const findings = detectSecrets(content, 'config.ts');
    expect(findings.some((f) => f.type === 'AWS Access Key')).toBe(true);
    expect(findings[0].severity).toBe('CRITICAL');
  });

  it('detects OpenAI API keys', () => {
    const content = 'const key = "sk-proj1234567890abcdef1234567890abcdef";';
    const findings = detectSecrets(content, 'config.ts');
    expect(findings.some((f) => f.type === 'OpenAI API Key')).toBe(true);
  });

  it('detects database URLs with credentials', () => {
    const content = 'const db = "postgres://admin:secretpass@db.example.com:5432/mydb";';
    const findings = detectSecrets(content, 'config.ts');
    expect(findings.some((f) => f.type === 'Database URL')).toBe(true);
  });

  it('detects private keys', () => {
    const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...';
    const findings = detectSecrets(content, 'key.pem');
    expect(findings.some((f) => f.type === 'Private Key')).toBe(true);
  });

  it('skips placeholder values', () => {
    const content = 'const key = "sk-test-placeholder-key-value";';
    const findings = detectSecrets(content, 'config.ts');
    expect(findings.length).toBe(0);
  });

  it('skips test files by default', () => {
    const content = 'const key = "AKIAIOSFODNN7EXAMPLE";';
    const findings = detectSecrets(content, 'src/__tests__/config.test.ts');
    expect(findings.length).toBe(0);
  });

  it('detects AI pattern: inlined env vars', () => {
    const content = 'const url = "postgres://user:pass@host:5432/db";';
    const findings = detectSecrets(content, 'src/config.ts');
    // Should find both database URL and inlined env var
    expect(findings.length).toBeGreaterThan(0);
  });

  it('detects AI pattern: disabled SSL', () => {
    const content = 'const opts = { rejectUnauthorized: false };';
    const findings = detectSecrets(content, 'src/fetch.ts');
    expect(findings.some((f) => f.type === 'Disabled SSL Verification')).toBe(true);
    expect(findings.some((f) => f.isAiPattern)).toBe(true);
  });

  it('detects AI pattern: wildcard CORS', () => {
    const content = 'app.use(cors({ origin: "*" }));';
    const findings = detectSecrets(content, 'src/server.ts');
    expect(findings.some((f) => f.type === 'Wildcard CORS')).toBe(true);
  });

  it('returns clean for safe code', () => {
    const content = 'const greeting = "hello world";';
    const findings = detectSecrets(content, 'src/index.ts');
    expect(findings.length).toBe(0);
  });

  it('detects GitHub tokens', () => {
    const content = 'const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";';
    const findings = detectSecrets(content, 'deploy.ts');
    expect(findings.some((f) => f.type === 'GitHub Token')).toBe(true);
  });
});

describe('checkCodeSafety', () => {
  it('detects eval usage', () => {
    const content = 'const result = eval(userInput);';
    const findings = checkCodeSafety(content, 'src/handler.ts');
    expect(findings.some((f) => f.rule === 'eval_usage')).toBe(true);
    expect(findings[0].severity).toBe('CRITICAL');
  });

  it('detects innerHTML assignment', () => {
    const content = 'element.innerHTML = data;';
    const findings = checkCodeSafety(content, 'src/render.ts');
    expect(findings.some((f) => f.rule === 'innerHTML_assignment')).toBe(true);
  });

  it('detects chmod 777', () => {
    const content = 'exec("chmod 777 /var/data")';
    const findings = checkCodeSafety(content, 'deploy.sh');
    expect(findings.some((f) => f.rule === 'chmod_777')).toBe(true);
  });

  it('detects wildcard IAM permissions', () => {
    const content = '{"Action": "*", "Resource": "*"}';
    const findings = checkCodeSafety(content, 'policy.json');
    expect(findings.some((f) => f.rule === 'wildcard_permissions')).toBe(true);
  });

  it('returns clean for safe code', () => {
    const content = 'function add(a: number, b: number) { return a + b; }';
    const findings = checkCodeSafety(content, 'src/math.ts');
    expect(findings.length).toBe(0);
  });

  it('detects security TODOs', () => {
    const content = '// TODO: fix auth validation before launch';
    const findings = checkCodeSafety(content, 'src/auth.ts');
    expect(findings.some((f) => f.rule === 'todo_security')).toBe(true);
  });
});
