import { readPolicyFile, readEnvFile } from '../utils/config.js';
import { green, amber, red, dim, bold, cyan } from '../utils/colors.js';
import { progressBar } from '../utils/table.js';

export async function runReport(): Promise<void> {
  const args = process.argv.slice(3);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`
  corpus report

  Fetch and display trust-score statistics for your project from the
  Corpus API (last 30 days). Requires a corpus.policy.yaml with an
  agent name and an optional .env.corpus with CORPUS_API_ENDPOINT.

  Options:
    --help    Show this help

  Examples:
    corpus report

`);
    return;
  }

  const policy = readPolicyFile();
  if (!policy) {
    process.stdout.write(red('  No corpus.policy.yaml found. Run corpus init first.\n'));
    process.exit(1);
  }

  const env = readEnvFile();
  const slug = String(policy.agent ?? 'unknown');
  const endpoint = env.CORPUS_API_ENDPOINT ?? 'https://corpus.run';

  process.stdout.write('\n');
  process.stdout.write(bold(`  CORPUS REPORT   ${cyan(slug)}   last 30 days\n`));
  process.stdout.write('  ' + '\u2550'.repeat(51) + '\n\n');

  // Fetch stats
  try {
    const url = `${endpoint}/api/project/${slug}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) {
        process.stdout.write(`  Project '${slug}' not found on ${endpoint}\n`);
        process.stdout.write(`  Start sending events with the SDK to see data here.\n\n`);
        return;
      }
      process.stdout.write(red(`  API returned ${res.status}\n`));
      process.exit(1);
    }

    const data = await res.json() as {
      stats: {
        passRate: number;
        totalRuns: number;
        confirmCount: number;
        blockCount: number;
        cancelledCount: number;
      };
      policyBreakdown: Array<{
        policyTriggered: string;
        passRate: number;
        totalRuns: number;
        blockCount: number;
        confirmCount: number;
      }>;
      recentActivity: Array<{
        verdict: string;
        actionType: string;
        policyTriggered: string;
        durationMs: number;
        createdAt: string;
      }>;
    };
    const s = data.stats;

    // Pass rate bar
    const barColor = s.passRate >= 95 ? green : s.passRate >= 80 ? amber : red;
    process.stdout.write(`  Pass rate      ${barColor(s.passRate.toFixed(1) + '%')}   ${barColor(progressBar(s.passRate))}\n`);
    process.stdout.write(`  Total actions  ${s.totalRuns.toLocaleString()}\n`);
    process.stdout.write(`  Confirmed      ${s.confirmCount}      ${dim('user saw and approved')}\n`);
    process.stdout.write(`  Blocked        ${s.blockCount}       ${dim('stopped by hard policy')}\n`);
    process.stdout.write(`  Cancelled      ${s.cancelledCount}       ${dim('user saw and declined')}\n`);

    // Policy breakdown
    if (data.policyBreakdown.length > 0) {
      process.stdout.write('\n');
      process.stdout.write(bold('  POLICY BREAKDOWN\n'));
      for (const p of data.policyBreakdown) {
        const pColor = p.passRate >= 95 ? green : p.passRate >= 80 ? amber : red;
        const name = p.policyTriggered.padEnd(22);
        const extra = [];
        if (p.blockCount > 0) extra.push(`${p.blockCount} blocked`);
        if (p.confirmCount > 0) extra.push(`${p.confirmCount} confirmed`);
        const detail = extra.length > 0 ? `[${extra.join(', ')}]` : '';
        process.stdout.write(`  ${name} ${pColor(p.passRate + '%')}   (${p.totalRuns} runs)   ${dim(detail)}\n`);
      }
    }

    // Recent activity
    if (data.recentActivity.length > 0) {
      process.stdout.write('\n');
      process.stdout.write(bold('  RECENT ACTIVITY (last 10)\n'));
      for (const a of data.recentActivity.slice(0, 10)) {
        const vColor = a.verdict === 'PASS' ? green : a.verdict === 'BLOCK' ? red : amber;
        const verdict = vColor(a.verdict.padEnd(8));
        const action = a.actionType.padEnd(18).slice(0, 18);
        const policy = a.policyTriggered.padEnd(16).slice(0, 16);
        const dur = `${a.durationMs}ms`.padStart(6);
        process.stdout.write(`  ${verdict} ${action} ${policy} ${dur}\n`);
      }
    }

    process.stdout.write('\n');
    process.stdout.write(dim(`  View full dashboard: ${endpoint}/${slug}\n`));
    process.stdout.write('\n');
  } catch (e) {
    process.stdout.write(red(`  Failed to fetch stats: ${e instanceof Error ? e.message : String(e)}\n`));
    process.exit(1);
  }
}
