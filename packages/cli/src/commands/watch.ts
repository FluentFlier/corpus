import { watch, readFileSync, statSync, readdirSync } from 'fs';
import path from 'path';
import { green, amber, red, dim, bold, cyan } from '../utils/colors.js';
import { detectSecrets } from '@corpus/core';
import { checkCodeSafety } from '@corpus/core';
import { checkForCVEs } from '@corpus/core';
import { checkDependencies, extractImportedPackages } from '@corpus/core';
import { checkFile } from '@corpus/core';
import { shouldSuppress } from '@corpus/core';

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
  // Intelligence stats
  cvesDetected: number;
  depsChecked: number;
  contractViolations: number;
  autoHealed: number;
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
  cvesDetected: 0,
  depsChecked: 0,
  contractViolations: 0,
  autoHealed: 0,
};

// ── Deep scanner (uses core scanners) ───────────────────────────────────────

interface ScanResult {
  severity: string;
  message: string;
  type: string;
  cveId?: string;
}

function deepScan(content: string, filepath: string, projectRoot: string): ScanResult[] {
  const results: ScanResult[] = [];

  // Core secret detection
  try {
    const secrets = detectSecrets(content, filepath);
    for (const s of secrets) {
      results.push({ severity: s.severity === 'CRITICAL' ? 'CRIT' : 'WARN', message: `${s.type}: ${s.redacted}`, type: s.type });
    }
  } catch {}

  // Code safety
  try {
    const safety = checkCodeSafety(content, filepath);
    for (const s of safety) {
      // Check pattern intelligence for suppression
      const suppression = shouldSuppress(projectRoot, s.rule, filepath);
      if (suppression.suppress) continue;
      results.push({ severity: s.severity === 'CRITICAL' ? 'CRIT' : s.severity === 'WARNING' ? 'WARN' : 'INFO', message: s.message, type: s.rule });
    }
  } catch {}

  // CVE pattern detection
  try {
    const cves = checkForCVEs(content, filepath);
    for (const c of cves) {
      results.push({ severity: 'CRIT', message: `${c.cveId}: ${c.name}`, type: `CVE:${c.cveId}`, cveId: c.cveId });
    }
  } catch {}

  // Graph contract verification (if graph exists)
  try {
    const graphResult = checkFile(projectRoot, filepath, content);
    if (graphResult.verdict === 'VIOLATES') {
      for (const v of graphResult.violations) {
        results.push({ severity: v.severity === 'CRITICAL' ? 'CRIT' : 'WARN', message: `Contract: ${v.message}`, type: `contract:${v.type}` });
      }
    }
  } catch {}

  return results;
}

// Async dependency check (runs separately due to network)
async function checkDeps(content: string, filepath: string, projectRoot: string): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  try {
    const findings = await checkDependencies(content, filepath, { projectRoot });
    for (const f of findings) {
      results.push({
        severity: f.severity === 'CRITICAL' ? 'CRIT' : 'WARN',
        message: `Dep: ${f.package} (${f.reason})${f.similarPackages?.length ? ' → did you mean ' + f.similarPackages[0] + '?' : ''}`,
        type: `dep:${f.reason}`,
      });
    }
  } catch {}
  return results;
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

  // Intelligence stats
  if (stats.cvesDetected > 0 || stats.contractViolations > 0 || stats.depsChecked > 0) {
    process.stdout.write(`  ${red(`CVEs: ${stats.cvesDetected}`)}  ${amber(`Contracts: ${stats.contractViolations}`)}  ${cyan(`Deps checked: ${stats.depsChecked}`)}  ${green(`Auto-healed: ${stats.autoHealed}`)}\n\n`);
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
            const findings = deepScan(content, full, dir);
            stats.filesScanned++;
            const cveCount = findings.filter(f => f.type.startsWith('CVE:')).length;
            const contractCount = findings.filter(f => f.type.startsWith('contract:')).length;
            stats.cvesDetected += cveCount;
            stats.contractViolations += contractCount;
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
        const findings = deepScan(content, filepath, resolvedDir);
        const relPath = path.relative(resolvedDir, filepath);
        const time = formatTime();

        stats.filesScanned++;
        stats.lastScanTime = time;

        const cveCount = findings.filter(f => f.type.startsWith('CVE:')).length;
        const contractCount = findings.filter(f => f.type.startsWith('contract:')).length;
        stats.cvesDetected += cveCount;
        stats.contractViolations += contractCount;

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

        // Async: check dependencies (non-blocking)
        checkDeps(content, filepath, resolvedDir).then(depResults => {
          if (depResults.length > 0) {
            stats.depsChecked++;
            for (const r of depResults) {
              stats.issuesFound++;
              if (r.severity === 'CRIT') stats.criticalCount++;
              else stats.warningCount++;
              stats.recentEvents.push({ time: formatTime(), file: relPath, severity: r.severity, message: r.message });
            }
            renderDashboard(resolvedDir);
          }
        });

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
      process.stdout.write(`  CVEs detected:  ${stats.cvesDetected}\n`);
      process.stdout.write(`  Deps checked:   ${stats.depsChecked}\n`);
      process.stdout.write(`  Violations:     ${stats.contractViolations}\n`);
      process.stdout.write(`  Auto-healed:    ${stats.autoHealed}\n`);
      process.stdout.write(`  Duration:       ${uptime()}\n`);
      process.stdout.write('\n');
      process.exit(0);
    });
  });
}
