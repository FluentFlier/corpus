import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type DependencySeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface DependencyFinding {
  severity: DependencySeverity;
  package: string;
  file: string;
  line: number;
  reason: 'nonexistent' | 'typosquat' | 'unpopular_suspicious';
  suggestion: string;
  similarPackages?: string[];
}

interface CacheEntry {
  exists: boolean;
  checkedAt: string;
}

interface NpmCache {
  [pkg: string]: CacheEntry;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const TOP_PACKAGES: string[] = [
  'react', 'react-dom', 'next', 'express', 'lodash', 'axios', 'typescript',
  'webpack', 'babel', 'eslint', 'prettier', 'jest', 'mocha', 'chai', 'sinon',
  'moment', 'dayjs', 'date-fns', 'uuid', 'dotenv', 'cors', 'body-parser',
  'cookie-parser', 'jsonwebtoken', 'bcrypt', 'passport', 'mongoose', 'sequelize',
  'prisma', '@prisma/client', 'pg', 'mysql2', 'redis', 'ioredis', 'socket.io',
  'ws', 'graphql', 'apollo-server', '@apollo/client', 'tailwindcss', 'postcss',
  'autoprefixer', 'sass', 'styled-components', '@emotion/react', 'framer-motion',
  'three', 'd3', 'chart.js', '@types/node', '@types/react', 'zod', 'yup', 'joi',
  'ajv', 'commander', 'inquirer', 'chalk', 'ora', 'got', 'node-fetch', 'cheerio',
  'puppeteer', 'playwright', 'sharp', 'multer', 'formidable', 'nodemailer', 'bull',
  'stripe', '@stripe/stripe-js', 'firebase', '@firebase/app', 'supabase',
  '@supabase/supabase-js', 'aws-sdk', '@aws-sdk/client-s3', 'openai',
  '@anthropic-ai/sdk', 'langchain', '@langchain/core', 'vue', 'svelte', 'angular',
  '@angular/core', 'nuxt', 'vite', 'esbuild', 'rollup', 'turbo', 'pnpm', 'bun',
];

const IMPORT_PATTERNS: RegExp[] = [
  /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function extractPackageName(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;

  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }

  return specifier.split('/')[0];
}

export function extractImportedPackages(content: string): string[] {
  const packages = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const pkg = extractPackageName(match[1]);
      if (pkg) packages.add(pkg);
    }
  }

  return [...packages];
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function findTyposquatMatches(pkg: string): string[] {
  const matches: string[] = [];

  for (const top of TOP_PACKAGES) {
    if (top === pkg) continue;
    const dist = levenshtein(pkg, top);
    if (dist > 0 && dist <= 2) matches.push(top);
  }

  return matches;
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function loadCache(projectRoot: string): NpmCache {
  const cachePath = join(projectRoot, '.corpus', 'npm-cache.json');
  if (!existsSync(cachePath)) return {};

  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(projectRoot: string, cache: NpmCache): void {
  const cacheDir = join(projectRoot, '.corpus');
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, 'npm-cache.json'), JSON.stringify(cache, null, 2));
}

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - new Date(entry.checkedAt).getTime() < CACHE_TTL_MS;
}

function loadKnownPackages(projectRoot: string): Set<string> {
  const pkgPath = join(projectRoot, 'package.json');
  if (!existsSync(pkgPath)) return new Set();

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = Object.keys(pkg.dependencies ?? {});
    const devDeps = Object.keys(pkg.devDependencies ?? {});
    return new Set([...deps, ...devDeps]);
  } catch {
    return new Set();
  }
}

async function checkNpmExists(pkg: string): Promise<boolean> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
      method: 'HEAD',
    });
    return res.ok;
  } catch {
    return true;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkDependencies(
  content: string,
  filepath: string,
  options?: { projectRoot?: string; knownPackages?: Set<string> }
): Promise<DependencyFinding[]> {
  const findings: DependencyFinding[] = [];
  const projectRoot = options?.projectRoot ?? process.cwd();
  const knownPackages = options?.knownPackages ?? loadKnownPackages(projectRoot);
  const cache = loadCache(projectRoot);

  const packageLocations = new Map<string, number[]>();

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const pkg = extractPackageName(match[1]);
      if (!pkg) continue;

      const line = getLineNumber(content, match.index);
      if (!packageLocations.has(pkg)) packageLocations.set(pkg, []);
      packageLocations.get(pkg)!.push(line);
    }
  }

  const packagesToCheck: string[] = [];
  for (const pkg of packageLocations.keys()) {
    if (knownPackages.has(pkg)) continue;
    if (pkg.startsWith('node:')) continue;
    packagesToCheck.push(pkg);
  }

  let requestCount = 0;

  for (const pkg of packagesToCheck) {
    const lines = packageLocations.get(pkg)!;
    const line = lines[0];

    const typosquatMatches = findTyposquatMatches(pkg);

    let exists: boolean;
    const cached = cache[pkg];
    if (cached && isCacheValid(cached)) {
      exists = cached.exists;
    } else {
      if (requestCount > 0 && requestCount % 10 === 0) {
        await delay(1000);
      }
      exists = await checkNpmExists(pkg);
      cache[pkg] = { exists, checkedAt: new Date().toISOString() };
      requestCount++;
    }

    if (!exists) {
      const finding: DependencyFinding = {
        severity: 'CRITICAL',
        package: pkg,
        file: filepath,
        line,
        reason: 'nonexistent',
        suggestion: `Package "${pkg}" does not exist on npm. This may be an AI-hallucinated dependency.`,
      };
      if (typosquatMatches.length > 0) {
        finding.similarPackages = typosquatMatches;
        finding.suggestion += ` Did you mean: ${typosquatMatches.join(', ')}?`;
      }
      findings.push(finding);
    } else if (typosquatMatches.length > 0) {
      findings.push({
        severity: 'WARNING',
        package: pkg,
        file: filepath,
        line,
        reason: 'typosquat',
        suggestion: `Package "${pkg}" exists but is very similar to: ${typosquatMatches.join(', ')}. Verify this is the intended package.`,
        similarPackages: typosquatMatches,
      });
    }
  }

  saveCache(projectRoot, cache);

  const severityOrder: Record<DependencySeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings;
}
