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
}

export interface LearnedPatterns {
  version: 1;
  learnedFrom: number;
  totalFindings: number;
  patterns: PatternSignature[];
  lastUpdated: string;
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
  } else {
    existing = {
      version: 1,
      learnedFrom: 0,
      totalFindings: 0,
      patterns: [],
      lastUpdated: new Date().toISOString(),
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
      };
      existing.patterns.push(pattern);
    }

    for (const f of typeFindings) {
      pattern.totalOccurrences++;
      if (isTestFile(f.file)) pattern.inTestFiles++;
      else if (isBuildFile(f.file)) pattern.inBuildTools++;
      else pattern.inProductionFiles++;

      if (pattern.examples.length < 5) {
        pattern.examples.push({ repo: f.repo, file: f.file });
      }
    }

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
export function shouldSuppress(
  projectRoot: string,
  type: string,
  file: string
): { suppress: boolean; reason?: string } {
  const patterns = getLearnedPatterns(projectRoot);
  if (!patterns) return { suppress: false };

  const pattern = patterns.patterns.find(p => p.type === type);
  if (!pattern) return { suppress: false };

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
