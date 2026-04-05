import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { green, red, amber, dim, bold } from '../utils/colors.js';

interface CheckResult {
  file: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

function findPolicyFiles(target?: string): string[] {
  const files: string[] = [];

  // If a specific file was given, just return it
  if (target && existsSync(target)) {
    try {
      const stat = statSync(target);
      if (stat.isFile()) {
        return [target];
      }
    } catch {
      // fall through to directory logic
    }
  }

  // Determine directories to scan
  const dirs = target ? [target] : ['.'];
  const isTargetMode = Boolean(target);

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (isTargetMode) {
          // When scanning a specific directory, include all yaml/jac
          if (entry.endsWith('.yaml') || entry.endsWith('.yml') || entry.endsWith('.jac')) {
            files.push(full);
          }
        } else {
          // Default mode: only policy-looking yaml files in CWD
          if (entry.match(/corpus.*\.yaml$/) || entry.match(/.*\.policy\.yaml$/) || entry.endsWith('.jac')) {
            files.push(full);
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Also scan standard policy directories when no specific target
  if (!target) {
    const policyDirs = ['./policies/builtin', './policies', './policies/examples'];
    for (const pd of policyDirs) {
      if (!existsSync(pd)) continue;
      try {
        for (const entry of readdirSync(pd)) {
          const full = path.join(pd, entry);
          if (entry.endsWith('.jac') || entry.endsWith('.yaml')) {
            if (!files.includes(full)) {
              files.push(full);
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  return files;
}

function checkYamlFile(filePath: string): CheckResult {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    if (!raw.includes('agent:') || !raw.includes('rules:')) {
      return { file: filePath, status: 'FAIL', detail: 'Missing agent or rules field' };
    }
    const ruleCount = (raw.match(/- name:/g) || []).length;
    return { file: filePath, status: 'PASS', detail: `${ruleCount} rule${ruleCount !== 1 ? 's' : ''}` };
  } catch (e) {
    return { file: filePath, status: 'FAIL', detail: String(e) };
  }
}

function checkJacFile(filePath: string): CheckResult {
  const resolved = path.resolve(filePath);
  if (!resolved.endsWith('.jac')) {
    return { file: filePath, status: 'FAIL', detail: 'Not a .jac file' };
  }
  try {
    execSync('jac check ' + JSON.stringify(resolved), { stdio: 'pipe' });
    return { file: filePath, status: 'PASS', detail: 'validated via Jac' };
  } catch (e) {
    const stderr = e instanceof Error && 'stderr' in e ? String((e as { stderr: unknown }).stderr) : '';
    const firstLine = stderr.split('\n')[0] || 'validation failed';
    if (firstLine.includes('command not found') || firstLine.includes('not found') || firstLine.includes('ENOENT')) {
      return { file: filePath, status: 'WARN', detail: 'jac not installed (pip install jaseci)' };
    }
    return { file: filePath, status: 'FAIL', detail: firstLine.trim() };
  }
}

export async function runCheck(): Promise<void> {
  const args = process.argv.slice(3);
  let policyPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help': case '-h':
        process.stdout.write(`
  corpus check [options]

  Validate policy files (YAML and Jac) in the current directory.

  Options:
    --policy-path <path>   Path to a specific policy file or directory
    --help                 Show this help

  Examples:
    corpus check                                    Scan CWD for policy files
    corpus check --policy-path ./my-policy.yaml     Check a specific file
    corpus check --policy-path ./policies/          Check a specific directory

`);
        return;
      case '--policy-path':
        policyPath = args[++i];
        break;
    }
  }

  process.stdout.write('\n');
  process.stdout.write(bold('  CORPUS POLICY CHECK\n'));
  process.stdout.write('  ' + '\u2550'.repeat(46) + '\n\n');

  const files = findPolicyFiles(policyPath);

  if (files.length === 0) {
    process.stdout.write('  No policy files found.\n');
    process.stdout.write('  Run ' + green('corpus init') + ' to create one.\n\n');
    process.exit(1);
  }

  const results: CheckResult[] = [];

  for (const file of files) {
    const result = file.endsWith('.jac') ? checkJacFile(file) : checkYamlFile(file);
    results.push(result);

    const icon = result.status === 'PASS' ? green('PASS') : result.status === 'WARN' ? amber('WARN') : red('FAIL');
    const name = file.padEnd(40);
    process.stdout.write(`  ${name} ${icon}   ${dim(result.detail)}\n`);
  }

  const failures = results.filter((r) => r.status === 'FAIL');
  const warnings = results.filter((r) => r.status === 'WARN');
  const passes = results.filter((r) => r.status === 'PASS');
  process.stdout.write('\n');

  if (failures.length > 0) {
    process.stdout.write(red(`  ${failures.length} file(s) failed. Fix errors before deploying.\n`));
    process.stdout.write('\n');
    process.exit(1);
  }

  if (warnings.length > 0 && passes.length > 0) {
    process.stdout.write(green(`  ${passes.length} file(s) passed`) + `, ${warnings.length} warning(s).\n`);
  } else if (warnings.length > 0) {
    process.stdout.write(amber(`  ${warnings.length} file(s) need attention (jac not installed).\n`));
  } else {
    process.stdout.write(green(`  All ${passes.length} file(s) passed.\n`));
  }
  process.stdout.write('\n');

  if (failures.length > 0) process.exit(1);
  process.exit(0);
}
