/**
 * Corpus Pattern Learner
 *
 * Analyzes findings across multiple repos to learn which patterns
 * are real issues vs false positives. Builds a statistical model
 * that evolves as more repos are scanned.
 *
 * This is the "learning" part of the immune system.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

export interface PatternSignature {
  type: string;
  totalOccurrences: number;
  inTestFiles: number;
  inProductionFiles: number;
  inBuildTools: number;
  falsePositiveRate: number;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  adjustedSeverity: 'CRITICAL' | 'WARNING' | 'INFO' | 'SUPPRESSED';
  description: string;
  examples: { repo: string; file: string; }[];

  // Prevalence intelligence
  repoCount: number;              // how many unique repos this appears in
  repoPrevalence: number;         // % of total repos scanned that have this pattern

  // Context-aware classification
  contextBreakdown: Record<string, number>;  // e.g. { "webpack-config": 45, "route-handler": 3, "middleware": 12 }

  // Co-occurrence signals
  coOccursWith: Array<{
    pattern: string;
    correlation: number;           // 0-1
    combinedRisk: 'ELEVATED' | 'NORMAL';
  }>;

  // CVE linkage
  linkedCVEs: string[];

  // Repo-category weighting
  categoryWeights: Record<string, number>;  // e.g. { "auth-library": 0.9, "ui-component": 0.3 }
}

export interface LearnedPatterns {
  version: 1;
  learnedFrom: number;
  totalFindings: number;
  patterns: PatternSignature[];
  lastUpdated: string;
  knownPackages: string[];         // legitimate npm packages seen across repos
  repoCategories: Record<string, string>;  // repo → category mapping
}

const TEST_INDICATORS = ['test', 'spec', '__tests__', '__mocks__', 'fixture', 'mock', 'stub', 'e2e', 'integration-test'];
const BUILD_INDICATORS = ['build', 'scripts', 'tools', 'bin', 'cli', 'webpack', 'rollup', 'esbuild', 'vite.config', 'jest.config'];

function isTestFile(filepath: string): boolean {
  const lower = filepath.toLowerCase();
  return TEST_INDICATORS.some(t => lower.includes(t));
}

function isBuildFile(filepath: string): boolean {
  const lower = filepath.toLowerCase();
  return BUILD_INDICATORS.some(t => lower.includes(t));
}

/**
 * Classify the semantic context of a file based on its path and content.
 */
export function classifyContext(filepath: string, content: string): string {
  const lowerPath = filepath.toLowerCase();
  const lowerContent = content.toLowerCase();

  // webpack/rollup/vite config
  if (/webpack|rollup|vite\.config|vite\./.test(lowerPath)) return 'webpack-config';

  // Route handler patterns (express, hono, koa, etc.)
  if (/\bapp\.(get|post|put|delete|patch|use)\s*\(|\brouter\.(get|post|put|delete|patch|use)\s*\(/.test(content)) return 'route-handler';

  // Middleware patterns
  if (/\b(req|request)\s*,\s*(res|response)\s*,\s*next\b/.test(content)) return 'middleware';

  // Auth module
  if (/auth|login|session|passport|jwt|oauth/i.test(lowerPath) || /\b(authenticate|authorize|login|logout|session|jwt|oauth|passport)\b/i.test(content)) return 'auth-module';

  // Test harness
  if (isTestFile(filepath)) return 'test-harness';

  // Build script
  if (isBuildFile(filepath)) return 'build-script';

  // Database access
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/.test(content) || /\b(prisma|sequelize|typeorm|knex|mongoose|mongodb)\b/i.test(content)) return 'database-access';

  // API client
  if (/\bfetch\s*\(|\baxios\b|\bhttp\.(get|post|put|delete)\b|\bgot\b|\brequest\s*\(/i.test(content)) return 'api-client';

  return 'production';
}

/**
 * Learn patterns from a set of findings across multiple repos.
 * Updates the learned patterns file.
 */
export function learnFromFindings(
  projectRoot: string,
  findings: Array<{
    repo: string;
    type: string;
    severity: string;
    file: string;
    message: string;
  }>
): LearnedPatterns {
  // Load existing patterns
  const patternsPath = path.join(projectRoot, '.corpus', 'patterns.json');
  let existing: LearnedPatterns;

  if (existsSync(patternsPath)) {
    existing = JSON.parse(readFileSync(patternsPath, 'utf-8'));
    // Ensure new fields exist on loaded data
    if (!existing.knownPackages) existing.knownPackages = [];
    if (!existing.repoCategories) existing.repoCategories = {};
  } else {
    existing = {
      version: 1,
      learnedFrom: 0,
      totalFindings: 0,
      patterns: [],
      lastUpdated: new Date().toISOString(),
      knownPackages: [],
      repoCategories: {},
    };
  }

  // Group findings by type
  const byType = new Map<string, typeof findings>();
  for (const f of findings) {
    if (!byType.has(f.type)) byType.set(f.type, []);
    byType.get(f.type)!.push(f);
  }

  // Update or create pattern signatures
  for (const [type, typeFindings] of byType) {
    let pattern = existing.patterns.find(p => p.type === type);
    if (!pattern) {
      pattern = {
        type,
        totalOccurrences: 0,
        inTestFiles: 0,
        inProductionFiles: 0,
        inBuildTools: 0,
        falsePositiveRate: 0,
        severity: typeFindings[0].severity as PatternSignature['severity'],
        adjustedSeverity: typeFindings[0].severity as PatternSignature['adjustedSeverity'],
        description: typeFindings[0].message,
        examples: [],
        repoCount: 0,
        repoPrevalence: 0,
        contextBreakdown: {},
        coOccursWith: [],
        linkedCVEs: [],
        categoryWeights: {},
      };
      existing.patterns.push(pattern);
    }

    // Ensure new fields exist on patterns loaded from disk
    if (!pattern.contextBreakdown) pattern.contextBreakdown = {};
    if (!pattern.coOccursWith) pattern.coOccursWith = [];
    if (!pattern.linkedCVEs) pattern.linkedCVEs = [];
    if (!pattern.categoryWeights) pattern.categoryWeights = {};
    if (pattern.repoCount === undefined) pattern.repoCount = 0;
    if (pattern.repoPrevalence === undefined) pattern.repoPrevalence = 0;

    // Track unique repos for this pattern
    const uniqueRepos = new Set<string>();
    for (const f of typeFindings) {
      pattern.totalOccurrences++;
      if (isTestFile(f.file)) pattern.inTestFiles++;
      else if (isBuildFile(f.file)) pattern.inBuildTools++;
      else pattern.inProductionFiles++;

      if (pattern.examples.length < 5) {
        pattern.examples.push({ repo: f.repo, file: f.file });
      }

      uniqueRepos.add(f.repo);

      // Classify context and update breakdown
      const context = classifyContext(f.file, f.message);
      pattern.contextBreakdown[context] = (pattern.contextBreakdown[context] || 0) + 1;
    }

    // Update repo count and prevalence
    pattern.repoCount += uniqueRepos.size;

    // Calculate false positive rate and adjust severity
    const nonProd = pattern.inTestFiles + pattern.inBuildTools;
    pattern.falsePositiveRate = pattern.totalOccurrences > 0
      ? Math.round((nonProd / pattern.totalOccurrences) * 100)
      : 0;

    // Adjust severity based on false positive rate
    if (pattern.falsePositiveRate > 80) {
      pattern.adjustedSeverity = 'SUPPRESSED';
    } else if (pattern.falsePositiveRate > 50) {
      // Downgrade severity by one level
      if (pattern.severity === 'CRITICAL') pattern.adjustedSeverity = 'WARNING';
      else if (pattern.severity === 'WARNING') pattern.adjustedSeverity = 'INFO';
    } else {
      pattern.adjustedSeverity = pattern.severity;
    }

    // CVE-linked patterns should never be suppressed
    if (pattern.linkedCVEs.length > 0) {
      if (pattern.adjustedSeverity === 'SUPPRESSED' || pattern.adjustedSeverity === 'INFO') {
        pattern.adjustedSeverity = 'WARNING';
      }
    }
  }

  // Update repo prevalence for all patterns now that learnedFrom is updated
  const updatedLearnedFrom = existing.learnedFrom + new Set(findings.map(f => f.repo)).size;
  for (const pattern of existing.patterns) {
    pattern.repoPrevalence = updatedLearnedFrom > 0
      ? Math.round((pattern.repoCount / updatedLearnedFrom) * 100)
      : 0;

    // Aggressive suppression: high prevalence + mostly non-production
    const totalContext = Object.values(pattern.contextBreakdown).reduce((a, b) => a + b, 0);
    const prodContext = pattern.contextBreakdown['production'] || 0;
    const routeContext = pattern.contextBreakdown['route-handler'] || 0;
    const authContext = pattern.contextBreakdown['auth-module'] || 0;
    const dbContext = pattern.contextBreakdown['database-access'] || 0;
    const productionContextCount = prodContext + routeContext + authContext + dbContext;
    const nonProductionRatio = totalContext > 0 ? (totalContext - productionContextCount) / totalContext : 0;

    if (pattern.repoPrevalence > 60 && nonProductionRatio > 0.7 && pattern.linkedCVEs.length === 0) {
      pattern.adjustedSeverity = 'SUPPRESSED';
    }
  }

  // Compute co-occurrence: patterns appearing in the same file
  const fileToPatterns = new Map<string, Set<string>>();
  for (const f of findings) {
    const key = `${f.repo}::${f.file}`;
    if (!fileToPatterns.has(key)) fileToPatterns.set(key, new Set());
    fileToPatterns.get(key)!.add(f.type);
  }

  const coOccurrenceCount = new Map<string, number>();
  const patternFileCount = new Map<string, number>();
  for (const patternSet of fileToPatterns.values()) {
    const types = Array.from(patternSet);
    for (const t of types) {
      patternFileCount.set(t, (patternFileCount.get(t) || 0) + 1);
    }
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const key = [types[i], types[j]].sort().join('::');
        coOccurrenceCount.set(key, (coOccurrenceCount.get(key) || 0) + 1);
      }
    }
  }

  // Update co-occurrence on each pattern
  for (const pattern of existing.patterns) {
    const newCoOccurs: typeof pattern.coOccursWith = [];
    for (const [key, count] of coOccurrenceCount) {
      const [a, b] = key.split('::');
      const other = a === pattern.type ? b : b === pattern.type ? a : null;
      if (!other) continue;
      const myFiles = patternFileCount.get(pattern.type) || 1;
      const correlation = Math.round((count / myFiles) * 100) / 100;
      const combinedRisk: 'ELEVATED' | 'NORMAL' = correlation > 0.5 ? 'ELEVATED' : 'NORMAL';
      newCoOccurs.push({ pattern: other, correlation, combinedRisk });
    }
    if (newCoOccurs.length > 0) {
      pattern.coOccursWith = newCoOccurs;
    }

    // If two co-occurring patterns both have ELEVATED risk, upgrade severity
    const hasElevated = pattern.coOccursWith.some(co => co.combinedRisk === 'ELEVATED');
    if (hasElevated && pattern.adjustedSeverity === 'INFO') {
      pattern.adjustedSeverity = 'WARNING';
    } else if (hasElevated && pattern.adjustedSeverity === 'WARNING') {
      pattern.adjustedSeverity = 'CRITICAL';
    }
  }

  // Sort by production occurrences (most important first)
  existing.patterns.sort((a, b) => b.inProductionFiles - a.inProductionFiles);

  existing.learnedFrom += new Set(findings.map(f => f.repo)).size;
  existing.totalFindings += findings.length;
  existing.lastUpdated = new Date().toISOString();

  // Save
  const corpusDir = path.join(projectRoot, '.corpus');
  if (!existsSync(corpusDir)) mkdirSync(corpusDir, { recursive: true });
  writeFileSync(patternsPath, JSON.stringify(existing, null, 2));

  return existing;
}

/**
 * Get learned patterns for display.
 */
export function getLearnedPatterns(projectRoot: string): LearnedPatterns | null {
  const patternsPath = path.join(projectRoot, '.corpus', 'patterns.json');
  if (!existsSync(patternsPath)) return null;
  try {
    return JSON.parse(readFileSync(patternsPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Check if a finding should be suppressed based on learned patterns.
 */
// Contexts where certain pattern types are always safe (always suppress)
const SAFE_CONTEXT_OVERRIDES: Record<string, string[]> = {
  'webpack-config': ['eval_usage', 'dynamic_require', 'process_env_access'],
  'build-script': ['eval_usage', 'dynamic_require', 'shell_exec', 'process_env_access'],
  'test-harness': ['eval_usage', 'hardcoded_secret', 'shell_exec', 'dynamic_require'],
};

// Contexts where certain pattern types are always dangerous (never suppress)
const DANGEROUS_CONTEXT_OVERRIDES: Record<string, string[]> = {
  'route-handler': ['eval_usage', 'shell_exec', 'sql_injection', 'prototype_pollution'],
  'auth-module': ['hardcoded_secret', 'weak_crypto', 'eval_usage'],
  'middleware': ['eval_usage', 'shell_exec', 'prototype_pollution'],
  'database-access': ['sql_injection', 'eval_usage'],
  'api-client': ['hardcoded_secret', 'ssrf'],
};

export function shouldSuppress(
  projectRoot: string,
  type: string,
  file: string,
  content?: string
): { suppress: boolean; reason?: string } {
  const patterns = getLearnedPatterns(projectRoot);
  if (!patterns) return { suppress: false };

  const pattern = patterns.patterns.find(p => p.type === type);
  if (!pattern) return { suppress: false };

  // Determine the context of this specific file
  const context = classifyContext(file, content || '');

  // Context-aware overrides: certain patterns in safe contexts always suppress
  const safePatterns = SAFE_CONTEXT_OVERRIDES[context];
  if (safePatterns && safePatterns.includes(type)) {
    return {
      suppress: true,
      reason: `Pattern '${type}' in '${context}' context is a known safe usage. Suppressed.`,
    };
  }

  // Context-aware overrides: certain patterns in dangerous contexts never suppress
  const dangerousPatterns = DANGEROUS_CONTEXT_OVERRIDES[context];
  if (dangerousPatterns && dangerousPatterns.includes(type)) {
    return { suppress: false };
  }

  // CVE-linked patterns are never suppressed
  if (pattern.linkedCVEs && pattern.linkedCVEs.length > 0) {
    return { suppress: false };
  }

  if (pattern.adjustedSeverity === 'SUPPRESSED') {
    return {
      suppress: true,
      reason: `Pattern '${type}' has ${pattern.falsePositiveRate}% false positive rate across ${pattern.totalOccurrences} occurrences in ${patterns.learnedFrom} repos. Likely not a real issue.`,
    };
  }

  if (isTestFile(file) && pattern.inTestFiles > pattern.inProductionFiles) {
    return {
      suppress: true,
      reason: `Pattern '${type}' is ${Math.round((pattern.inTestFiles / pattern.totalOccurrences) * 100)}% test-only. Suppressed in test files.`,
    };
  }

  return { suppress: false };
}

/**
 * Get intelligence verdict for a specific pattern type.
 */
export function getPatternIntelligence(projectRoot: string, type: string): {
  verdict: 'CRITICAL' | 'WARNING' | 'INFO' | 'SUPPRESSED';
  confidence: number;  // 0-100
  reasoning: string;   // human-readable explanation
} | null {
  const patterns = getLearnedPatterns(projectRoot);
  if (!patterns) return null;

  const pattern = patterns.patterns.find(p => p.type === type);
  if (!pattern) return null;

  // Confidence is based on sample size
  const sampleConfidence = Math.min(100, Math.round((pattern.totalOccurrences / 50) * 100));
  const repoConfidence = Math.min(100, Math.round((pattern.repoCount / 10) * 100));
  const confidence = Math.round((sampleConfidence + repoConfidence) / 2);

  const reasons: string[] = [];
  reasons.push(`Seen ${pattern.totalOccurrences} times across ${pattern.repoCount} repos (${pattern.repoPrevalence}% prevalence).`);

  if (pattern.falsePositiveRate > 50) {
    reasons.push(`High false positive rate: ${pattern.falsePositiveRate}%.`);
  }

  if (pattern.linkedCVEs.length > 0) {
    reasons.push(`Linked to CVEs: ${pattern.linkedCVEs.join(', ')}.`);
  }

  const elevatedCoOccurs = pattern.coOccursWith.filter(co => co.combinedRisk === 'ELEVATED');
  if (elevatedCoOccurs.length > 0) {
    reasons.push(`Elevated risk when combined with: ${elevatedCoOccurs.map(co => co.pattern).join(', ')}.`);
  }

  const topContexts = Object.entries(pattern.contextBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([ctx, count]) => `${ctx}(${count})`)
    .join(', ');
  if (topContexts) {
    reasons.push(`Top contexts: ${topContexts}.`);
  }

  return {
    verdict: pattern.adjustedSeverity,
    confidence,
    reasoning: reasons.join(' '),
  };
}

/**
 * Register known legitimate npm packages to reduce false positives.
 */
export function addKnownPackages(projectRoot: string, packages: string[]): void {
  const patternsPath = path.join(projectRoot, '.corpus', 'patterns.json');
  let existing: LearnedPatterns;

  if (existsSync(patternsPath)) {
    existing = JSON.parse(readFileSync(patternsPath, 'utf-8'));
    if (!existing.knownPackages) existing.knownPackages = [];
  } else {
    existing = {
      version: 1,
      learnedFrom: 0,
      totalFindings: 0,
      patterns: [],
      lastUpdated: new Date().toISOString(),
      knownPackages: [],
      repoCategories: {},
    };
  }

  const packageSet = new Set(existing.knownPackages);
  for (const pkg of packages) {
    packageSet.add(pkg);
  }
  existing.knownPackages = Array.from(packageSet);
  existing.lastUpdated = new Date().toISOString();

  const corpusDir = path.join(projectRoot, '.corpus');
  if (!existsSync(corpusDir)) mkdirSync(corpusDir, { recursive: true });
  writeFileSync(patternsPath, JSON.stringify(existing, null, 2));
}

/**
 * Categorize a repo for context-weighted pattern analysis.
 */
export function categorizeRepo(projectRoot: string, repo: string, category: string): void {
  const patternsPath = path.join(projectRoot, '.corpus', 'patterns.json');
  let existing: LearnedPatterns;

  if (existsSync(patternsPath)) {
    existing = JSON.parse(readFileSync(patternsPath, 'utf-8'));
    if (!existing.repoCategories) existing.repoCategories = {};
  } else {
    existing = {
      version: 1,
      learnedFrom: 0,
      totalFindings: 0,
      patterns: [],
      lastUpdated: new Date().toISOString(),
      knownPackages: [],
      repoCategories: {},
    };
  }

  existing.repoCategories[repo] = category;
  existing.lastUpdated = new Date().toISOString();

  const corpusDir = path.join(projectRoot, '.corpus');
  if (!existsSync(corpusDir)) mkdirSync(corpusDir, { recursive: true });
  writeFileSync(patternsPath, JSON.stringify(existing, null, 2));
}
