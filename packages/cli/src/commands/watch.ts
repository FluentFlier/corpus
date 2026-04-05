import { watch, readFileSync, statSync, readdirSync } from 'fs';
import path from 'path';
import { green, amber, red, dim, bold, cyan } from '../utils/colors.js';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', '__pycache__', '.venv',
  'venv', '.cache', '.turbo', 'coverage', '.nyc_output', '.claude',
  '.swarm', '.claude-flow', '.insforge',
]);

const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.json', '.yaml', '.yml',
  '.env', '.toml', '.sh', '.sql', '.tf', '.hcl', '.md',
]);

// ── Stats tracking ──────────────────────────────────────────────────────────

interface WatchStats {
  filesScanned: number;
  issuesFound: number;
  criticalCount: number;
  warningCount: number;
  passCount: number;
  startTime: number;
  lastScanTime: string;
  recentEvents: { time: string; file: string; severity: string; message: string }[];
}

const stats: WatchStats = {
  filesScanned: 0,
  issuesFound: 0,
  criticalCount: 0,
  warningCount: 0,
  passCount: 0,
  startTime: Date.now(),
  lastScanTime: '-',
  recentEvents: [],
};

// ── Inline scanner ──────────────────────────────────────────────────────────

function quickScan(content: string, filepath: string): { severity: string; message: string }[] {
  const findings: { severity: string; message: string }[] = [];
  const lower = filepath.toLowerCase();

  // Skip test files
  if (lower.includes('test') || lower.includes('spec') || lower.includes('__tests__')) return findings;

  const secretPatterns: [RegExp, string][] = [
    [/AKIA[0-9A-Z]{16}/g, 'AWS Access Key'],
    [/gh[pousr]_[A-Za-z0-9_]{36,}/g, 'GitHub Token'],
    [/sk-[A-Za-z0-9]{20,}/g, 'API Key (OpenAI/Anthropic)'],
    [/sk-ant-[A-Za-z0-9-]{20,}/g, 'Anthropic Key'],
    [/[sr]k_live_[A-Za-z0-9]{20,}/g, 'Stripe Live Key'],
    [/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, 'Private Key'],
    [/(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+:[^\s'"]+@/g, 'Database URL'],
    [/xox[baprs]-[0-9a-zA-Z-]{10,}/g, 'Slack Token'],
    [/SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, 'SendGrid Key'],
  ];

  const placeholderSkip = [/test|fake|dummy|placeholder|example|changeme|xxx|your_/i];

  for (const [regex, name] of secretPatterns) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      if (placeholderSkip.some((p) => p.test(m![0]))) continue;
      findings.push({ severity: 'CRIT', message: `${name}: ${m[0].slice(0, 8)}...` });
    }
  }

  // AI-specific patterns
  if (/rejectUnauthorized\s*:\s*false/.test(content)) {
    findings.push({ severity: 'WARN', message: 'Disabled SSL verification' });
  }
  if (/(?:cors|origin)\s*[=:]\s*['"]\*['"]/i.test(content)) {
    findings.push({ severity: 'WARN', message: 'Wildcard CORS (*)' });
  }
  if (/\beval\s*\(/.test(content) && !filepath.includes('scanner')) {
    findings.push({ severity: 'CRIT', message: 'eval() usage detected' });
  }
  if (/(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]/i.test(content)) {
    if (!placeholderSkip.some((p) => p.test(content))) {
      findings.push({ severity: 'WARN', message: 'Hardcoded password' });
    }
  }
  if (/chmod\s+777/.test(content)) {
    findings.push({ severity: 'WARN', message: 'chmod 777 permissions' });
  }

  // PII
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  if (emailRegex.test(content) && !filepath.endsWith('.md')) {
    findings.push({ severity: 'INFO', message: 'Email address in source' });
  }
  if (ssnRegex.test(content)) {
    findings.push({ severity: 'CRIT', message: 'SSN pattern detected' });
  }

  return findings;
}

function isScannable(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return SCAN_EXTENSIONS.has(ext) || filepath.includes('.env');
}

function formatTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

function uptime(): string {
  const ms = Date.now() - stats.startTime;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ── Dashboard rendering ─────────────────────────────────────────────────────

function renderDashboard(dir: string): void {
  const passRate = stats.filesScanned > 0
    ? Math.round((stats.passCount / stats.filesScanned) * 100)
    : 100;

  const passColor = passRate >= 95 ? green : passRate >= 80 ? amber : red;

  process.stdout.write('\x1b[2J\x1b[H'); // Clear screen
  process.stdout.write('\n');
  process.stdout.write(bold(`  CORPUS WATCH`) + dim(`  ${dir}\n`));
  process.stdout.write('  ' + '\u2550'.repeat(60) + '\n\n');

  // Stats row
  process.stdout.write(`  ${bold('Pass rate')}  ${passColor(`${passRate}%`)}    `);
  process.stdout.write(`${bold('Scanned')}  ${cyan(String(stats.filesScanned))}    `);
  process.stdout.write(`${bold('Issues')}  ${stats.issuesFound > 0 ? red(String(stats.issuesFound)) : green('0')}    `);
  process.stdout.write(`${bold('Uptime')}  ${dim(uptime())}\n`);
  process.stdout.write('\n');

  // Breakdown
  if (stats.criticalCount > 0 || stats.warningCount > 0) {
    process.stdout.write(`  ${red(`\u2716 ${stats.criticalCount} critical`)}  ${amber(`\u26A0 ${stats.warningCount} warning`)}  ${green(`\u2714 ${stats.passCount} clean`)}\n\n`);
  } else {
    process.stdout.write(`  ${green(`\u2714 ${stats.passCount} clean`)}  ${dim('No issues found')}\n\n`);
  }

  // Recent events
  process.stdout.write(dim('  Recent activity:\n'));
  if (stats.recentEvents.length === 0) {
    process.stdout.write(dim('  Waiting for file changes...\n'));
  } else {
    for (const event of stats.recentEvents.slice(-12)) {
      const sev = event.severity === 'CRIT' ? red('CRIT') :
                  event.severity === 'WARN' ? amber('WARN') :
                  event.severity === 'INFO' ? dim('INFO') :
                  green('PASS');
      process.stdout.write(`  ${dim(event.time)}  ${sev}  ${event.file.padEnd(38)}  ${dim(event.message)}\n`);
    }
  }

  process.stdout.write('\n' + dim('  Press Ctrl+C to stop\n'));
}

// ── Initial scan ────────────────────────────────────────────────────────────

function initialScan(dir: string): void {
  function walkAndScan(d: string): void {
    try {
      for (const entry of readdirSync(d)) {
        if (IGNORE_DIRS.has(entry)) continue;
        const full = path.join(d, entry);
        try {
          const s = statSync(full);
          if (s.isDirectory()) walkAndScan(full);
          else if (s.isFile() && isScannable(full)) {
            const content = readFileSync(full, 'utf-8');
            const findings = quickScan(content, full);
            stats.filesScanned++;
            if (findings.length === 0) {
              stats.passCount++;
            } else {
              stats.issuesFound += findings.length;
              const hasCrit = findings.some((f) => f.severity === 'CRIT');
              if (hasCrit) stats.criticalCount++;
              else stats.warningCount++;
              stats.recentEvents.push({
                time: formatTime(),
                file: path.relative(dir, full),
                severity: hasCrit ? 'CRIT' : 'WARN',
                message: findings[0].message,
              });
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  walkAndScan(dir);
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function runWatch(): Promise<void> {
  const targetDir = process.argv[3] || '.';
  const resolvedDir = path.resolve(targetDir);

  // Initial scan
  process.stdout.write(dim('\n  Running initial scan...\n'));
  initialScan(resolvedDir);

  // Render dashboard
  renderDashboard(resolvedDir);

  const debounce = new Map<string, NodeJS.Timeout>();

  function handleFileChange(filepath: string): void {
    if (!isScannable(filepath)) return;

    const existing = debounce.get(filepath);
    if (existing) clearTimeout(existing);

    debounce.set(filepath, setTimeout(() => {
      debounce.delete(filepath);

      try {
        const s = statSync(filepath);
        if (!s.isFile()) return;

        const content = readFileSync(filepath, 'utf-8');
        const findings = quickScan(content, filepath);
        const relPath = path.relative(resolvedDir, filepath);
        const time = formatTime();

        stats.filesScanned++;
        stats.lastScanTime = time;

        if (findings.length === 0) {
          stats.passCount++;
          stats.recentEvents.push({ time, file: relPath, severity: 'PASS', message: 'Clean' });
        } else {
          stats.issuesFound += findings.length;
          const hasCrit = findings.some((f) => f.severity === 'CRIT');
          if (hasCrit) stats.criticalCount++;
          else stats.warningCount++;

          for (const f of findings) {
            stats.recentEvents.push({ time, file: relPath, severity: f.severity, message: f.message });
          }
        }

        // Keep only last 50 events
        if (stats.recentEvents.length > 50) {
          stats.recentEvents = stats.recentEvents.slice(-50);
        }

        renderDashboard(resolvedDir);
      } catch { /* file deleted */ }
    }, 300));
  }

  // Watch
  try {
    watch(resolvedDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const fullPath = path.join(resolvedDir, filename);
      const parts = filename.split(path.sep);
      if (parts.some((p) => IGNORE_DIRS.has(p))) return;
      handleFileChange(fullPath);
    });
  } catch {
    process.stderr.write(red(`  Could not watch ${resolvedDir}\n`));
    process.exit(1);
  }

  // Refresh dashboard every 5s (uptime counter)
  setInterval(() => renderDashboard(resolvedDir), 5000);

  await new Promise<void>(() => {
    process.on('SIGINT', () => {
      process.stdout.write('\n\n');
      process.stdout.write(bold('  CORPUS WATCH SESSION SUMMARY\n'));
      process.stdout.write('  ' + '\u2550'.repeat(40) + '\n');
      process.stdout.write(`  Files scanned:  ${stats.filesScanned}\n`);
      process.stdout.write(`  Issues found:   ${stats.issuesFound}\n`);
      process.stdout.write(`  Critical:       ${stats.criticalCount}\n`);
      process.stdout.write(`  Warnings:       ${stats.warningCount}\n`);
      process.stdout.write(`  Clean:          ${stats.passCount}\n`);
      process.stdout.write(`  Duration:       ${uptime()}\n`);
      process.stdout.write('\n');
      process.exit(0);
    });
  });
}
