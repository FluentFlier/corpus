import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync } from 'fs';
import path from 'path';
import { green, amber, red, dim, bold, cyan } from '../utils/colors.js';

interface Finding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  type: string;
  line: number;
  message: string;
  fix: string;
  isAiPattern: boolean;
}

interface FileResult {
  file: string;
  score: number;
  findings: Finding[];
  lines: number;
}

const IGNORE = new Set([
  'node_modules', '.git', 'dist', '.next', '__pycache__', '.venv', 'venv',
  '.cache', '.turbo', 'coverage', '.nyc_output', 'build', 'out', '.output',
  '.nuxt', '.svelte-kit', 'vendor', 'Pods', '.gradle', 'target', 'bin',
  '.corpus', '.expo', '.idea', '.vscode',
]);

// Scan ALL code files, not just a few extensions
const CODE_EXTS = new Set([
  // JavaScript/TypeScript
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  // Python
  '.py', '.pyw',
  // Ruby
  '.rb', '.erb',
  // Go
  '.go',
  // Rust
  '.rs',
  // Java/Kotlin
  '.java', '.kt', '.kts',
  // Swift/ObjC
  '.swift', '.m', '.mm',
  // C/C++
  '.c', '.h', '.cpp', '.hpp', '.cc', '.hh',
  // C#
  '.cs',
  // PHP
  '.php',
  // Shell
  '.sh', '.bash', '.zsh',
  // Config
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.xml', '.plist',
  // Web
  '.html', '.htm', '.vue', '.svelte',
  // SQL
  '.sql',
  // Infrastructure
  '.tf', '.hcl', '.dockerfile',
  // Other
  '.r', '.jl', '.lua', '.pl', '.pm', '.ex', '.exs',
  '.graphql', '.gql', '.proto',
]);

function isScannable(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  const name = path.basename(filepath).toLowerCase();
  // Scan by extension
  if (CODE_EXTS.has(ext)) return true;
  // Scan env files
  if (name.startsWith('.env') || name === 'dockerfile' || name === 'makefile') return true;
  // Scan dotfiles that might contain secrets
  if (name === '.npmrc' || name === '.pypirc' || name === '.netrc') return true;
  return false;
}

function isTestFile(f: string): boolean {
  const l = f.toLowerCase();
  return l.includes('test') || l.includes('spec') || l.includes('__tests__') || l.includes('fixture') || l.includes('mock');
}

function isBinary(filepath: string): boolean {
  try {
    const buf = Buffer.alloc(512);
    const fd = openSync(filepath, 'r');
    const bytesRead = readSync(fd, buf, 0, 512, 0);
    closeSync(fd);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true; // null byte = binary
    }
    return false;
  } catch {
    return false;
  }
}

function walkDir(dir: string, files: string[], maxDepth: number = 15, depth: number = 0): void {
  if (depth > maxDepth) return;
  try {
    for (const entry of readdirSync(dir)) {
      if (IGNORE.has(entry) || entry === '.git' || entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      try {
        const s = statSync(full);
        if (s.isDirectory()) walkDir(full, files, maxDepth, depth + 1);
        else if (s.isFile() && s.size < 1_000_000 && isScannable(full) && !isBinary(full)) {
          files.push(full);
        }
      } catch { /* permission error */ }
    }
  } catch { /* permission error */ }
}

// ── Scanning ────────────────────────────────────────────────────────────────

const SECRETS: [RegExp, string, string][] = [
  [/AKIA[0-9A-Z]{16}/g, 'AWS Access Key', 'Move to process.env.AWS_ACCESS_KEY_ID'],
  [/gh[pousr]_[A-Za-z0-9_]{36,}/g, 'GitHub Token', 'Move to process.env.GITHUB_TOKEN'],
  [/sk-[A-Za-z0-9]{20,}/g, 'OpenAI/Anthropic Key', 'Move to process.env.API_KEY'],
  [/sk-ant-[A-Za-z0-9-]{20,}/g, 'Anthropic Key', 'Move to process.env.ANTHROPIC_API_KEY'],
  [/[sr]k_live_[A-Za-z0-9]{20,}/g, 'Stripe Live Key', 'Move to process.env.STRIPE_SECRET_KEY'],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, 'Private Key', 'Move to .env (never commit)'],
  [/(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/g, 'Database URL', 'Move to process.env.DATABASE_URL'],
  [/xox[baprs]-[0-9a-zA-Z-]{10,}/g, 'Slack Token', 'Move to process.env.SLACK_TOKEN'],
  [/SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, 'SendGrid Key', 'Move to process.env.SENDGRID_API_KEY'],
  [/(?:api_key|apikey|api_secret|secret_key|auth_token|access_token)\s*[=:]\s*['"]([A-Za-z0-9_\-]{20,})['"]/gi, 'Hardcoded Secret', 'Move to environment variable'],
  [/(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"]{8,})['"]/gi, 'Hardcoded Password', 'Move to environment variable'],
];

const SAFETY: [RegExp, string, string, 'CRITICAL' | 'WARNING' | 'INFO'][] = [
  [/\beval\s*\(/g, 'eval() usage', 'Use JSON.parse() or Function() instead', 'CRITICAL'],
  [/\.innerHTML\s*=/g, 'innerHTML assignment', 'Use textContent or sanitize with DOMPurify', 'WARNING'],
  [/rejectUnauthorized\s*:\s*false/g, 'Disabled SSL', 'Set rejectUnauthorized: true', 'WARNING'],
  [/(?:cors|origin)\s*[=:]\s*['"]\*['"]/gi, 'Wildcard CORS', 'Set specific origin', 'WARNING'],
  [/chmod\s+777/g, 'chmod 777', 'Use 755 or 644', 'WARNING'],
  [/"(?:Action|Resource)"\s*:\s*"\*"/g, 'Wildcard IAM', 'Use least-privilege', 'CRITICAL'],
  [/--no-verify/g, 'Skip verification flag', 'Remove before production', 'WARNING'],
  [/dangerouslySetInnerHTML/g, 'dangerouslySetInnerHTML', 'Sanitize HTML content first', 'WARNING'],
];

const PLACEHOLDER_SKIP = [/^sk-(?:test|fake|dummy|placeholder|example|xxx|your)/i, /^(?:test|fake|dummy|placeholder|example|changeme|TODO|your_|xxx|aaa|123|abc)/i, /<[A-Z_]+>/];

function scanFile(filepath: string): FileResult {
  let content: string;
  try { content = readFileSync(filepath, 'utf-8'); } catch { return { file: filepath, score: 100, findings: [], lines: 0 }; }

  const lines = content.split('\n').length;
  if (lines < 2) return { file: filepath, score: 100, findings: [], lines };

  const findings: Finding[] = [];
  const isTF = isTestFile(filepath);

  // Secrets
  for (const [regex, name, fix] of SECRETS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const val = m[1] ?? m[0];
      if (PLACEHOLDER_SKIP.some((p) => p.test(val))) continue;
      const line = content.slice(0, m.index).split('\n').length;
      findings.push({ severity: 'CRITICAL', type: name, line, message: `${name} detected`, fix, isAiPattern: false });
    }
  }

  // Safety (skip scanner definition files)
  const isScannerFile = filepath.includes('scanner') || filepath.includes('detect') || filepath.includes('guard');
  if (!isScannerFile) {
    for (const [regex, name, fix, sev] of SAFETY) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length;
        findings.push({ severity: sev, type: name, line, message: name, fix, isAiPattern: sev === 'WARNING' });
      }
    }
  }

  // AI patterns: inlined URLs
  if (!filepath.includes('.env')) {
    const urlRegex = /(?:const|let|var|=)\s*['"](?:postgres|mysql|mongodb|redis|https?):\/\/[^\s'"]*:[^\s'"]*@[^'"]+['"]/g;
    let urlM: RegExpExecArray | null;
    while ((urlM = urlRegex.exec(content)) !== null) {
      const line = content.slice(0, urlM.index).split('\n').length;
      findings.push({ severity: 'WARNING', type: 'Inlined URL', line, message: 'URL with credentials hardcoded', fix: 'Use environment variable', isAiPattern: true });
    }
  }

  // Unhandled async
  const fetchRegex = /(?:await\s+)?fetch\s*\(/g;
  let fetchM: RegExpExecArray | null;
  while ((fetchM = fetchRegex.exec(content)) !== null) {
    const before = content.slice(Math.max(0, fetchM.index - 300), fetchM.index);
    if (!before.includes('try') && !before.includes('catch') && !before.includes('.catch')) {
      const line = content.slice(0, fetchM.index).split('\n').length;
      findings.push({ severity: 'INFO', type: 'Unhandled fetch', line, message: 'fetch() without error handling', fix: 'Wrap in try/catch or add .catch()', isAiPattern: true });
    }
  }

  // PII
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(content)) {
    const idx = content.search(/\b\d{3}-\d{2}-\d{4}\b/);
    const line = content.slice(0, idx).split('\n').length;
    findings.push({ severity: 'CRITICAL', type: 'SSN', line, message: 'SSN pattern in source', fix: 'Remove immediately', isAiPattern: false });
  }

  // Score
  const mult = isTF ? 0.5 : 1;
  let critD = 0, warnD = 0, infoD = 0;
  for (const f of findings) {
    if (f.severity === 'CRITICAL') critD += 15 * mult;
    else if (f.severity === 'WARNING') warnD += 5 * mult;
    else infoD += 1 * mult;
  }
  const score = Math.max(0, Math.round(100 - Math.min(critD, 60) - Math.min(warnD, 25) - Math.min(infoD, 10)));

  return { file: filepath, score, findings, lines };
}

function scoreColor(score: number): (s: string) => string {
  if (score >= 80) return green;
  if (score >= 50) return amber;
  return red;
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'PASS';
  if (score >= 50) return 'WARNING';
  return 'CRITICAL';
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function runVerify(): Promise<void> {
  const args = process.argv.slice(3);
  const targetPaths = args.filter((a) => !a.startsWith('-'));
  const jsonMode = args.includes('--json');
  const showAll = args.includes('--all');

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`
  corpus verify [paths...] [options]

  Compute trust scores for every file in your codebase.
  Supports: TypeScript, JavaScript, Python, Go, Rust, Java, Swift,
  Ruby, PHP, C/C++, Shell, SQL, YAML, JSON, and more.

  Options:
    --json     Output as JSON
    --all      Show all files (default: only files with findings)
    --help     Show this help

  Examples:
    corpus verify              Verify current directory (auto-detects files)
    corpus verify src/         Verify specific directory
    corpus verify --json       Machine-readable output for CI

`);
    return;
  }

  const paths = targetPaths.length > 0 ? targetPaths : ['.'];
  const start = Date.now();

  // Collect files
  const allFiles: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) {
      process.stderr.write(`  Path not found: ${p}\n`);
      continue;
    }
    const s = statSync(p);
    if (s.isFile()) allFiles.push(p);
    else if (s.isDirectory()) walkDir(p, allFiles);
  }

  if (allFiles.length === 0) {
    process.stdout.write(dim('\n  No scannable files found.\n'));
    process.stdout.write(dim('  Corpus scans: .ts .js .py .go .rs .java .swift .rb .php .sh .sql .json .yaml and more.\n'));
    process.stdout.write(dim('  Try: corpus verify .\n\n'));
    return;
  }

  // Scan
  const results: FileResult[] = [];
  for (const f of allFiles) {
    results.push(scanFile(f));
  }
  results.sort((a, b) => a.score - b.score);

  const timeMs = Date.now() - start;
  const baseDir = path.resolve(paths[0] === '.' ? process.cwd() : paths[0]);

  // Codebase score
  const scored = results.filter((r) => r.lines >= 5);
  const totalLines = scored.reduce((s, r) => s + r.lines, 0);
  const codebaseScore = totalLines > 0
    ? Math.round(scored.reduce((s, r) => s + r.score * r.lines, 0) / totalLines)
    : 100;

  const critFiles = results.filter((r) => r.score < 50);
  const warnFiles = results.filter((r) => r.score >= 50 && r.score < 80);
  const cleanFiles = results.filter((r) => r.score >= 80);

  if (jsonMode) {
    process.stdout.write(JSON.stringify({
      codebaseTrustScore: codebaseScore,
      totalFiles: results.length,
      criticalFiles: critFiles.length,
      warningFiles: warnFiles.length,
      cleanFiles: cleanFiles.length,
      scanTimeMs: timeMs,
      files: results.map((r) => ({
        file: path.relative(baseDir, r.file),
        score: r.score,
        lines: r.lines,
        findings: r.findings,
      })),
    }, null, 2) + '\n');
    process.exit(codebaseScore < 50 ? 2 : codebaseScore < 80 ? 1 : 0);
    return;
  }

  // Pretty output
  process.stdout.write('\n');
  process.stdout.write(bold(`  CORPUS VERIFY`) + dim(`  ${allFiles.length} files  ${(timeMs / 1000).toFixed(1)}s\n`));
  process.stdout.write('  ' + '\u2550'.repeat(50) + '\n\n');

  const sc = scoreColor(codebaseScore);
  process.stdout.write(`  CODEBASE TRUST SCORE: ${sc(bold(`${codebaseScore}/100`))}\n\n`);

  const toShow = showAll ? results : results.filter((r) => r.findings.length > 0);

  for (const r of toShow) {
    const relPath = path.relative(baseDir, r.file);
    const fc = scoreColor(r.score);
    const label = scoreLabel(r.score);
    process.stdout.write(`  ${relPath.padEnd(50)} ${fc(`${r.score}/100`)}  ${fc(label)}\n`);

    for (const f of r.findings) {
      const sev = f.severity === 'CRITICAL' ? red('CRIT') : f.severity === 'WARNING' ? amber('WARN') : dim('INFO');
      const ai = f.isAiPattern ? amber(' [AI]') : '';
      process.stdout.write(`    ${sev} Line ${String(f.line).padEnd(4)} ${f.message}${ai}\n`);
      process.stdout.write(`         ${dim('FIX: ' + f.fix)}\n`);
    }
    if (r.findings.length > 0) process.stdout.write('\n');
  }

  process.stdout.write('  ' + '\u2500'.repeat(50) + '\n');
  const parts: string[] = [];
  if (critFiles.length > 0) parts.push(red(`${critFiles.length} critical`));
  if (warnFiles.length > 0) parts.push(amber(`${warnFiles.length} warning`));
  parts.push(green(`${cleanFiles.length} clean`));
  process.stdout.write(`  Files: ${parts.join(', ')}\n\n`);

  if (critFiles.length > 0) process.exit(2);
  if (warnFiles.length > 0) process.exit(1);
  process.exit(0);
}
