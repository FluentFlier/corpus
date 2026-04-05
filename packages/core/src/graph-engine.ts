/**
 * Corpus Graph Engine
 *
 * Auto-scans a TypeScript/JavaScript codebase and builds a structural graph.
 * Nodes = functions, modules, classes. Edges = calls, imports, exports.
 * This is the "immune system memory" -- Corpus learns what your codebase looks like.
 *
 * No manual configuration. No YAML to write. It figures it out.
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

// ── Graph Types ──────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  type: 'function' | 'class' | 'module' | 'variable';
  name: string;
  file: string;
  line: number;
  exported: boolean;
  params: string[];
  returnType: string | null;
  guards: string[];
  health: 'verified' | 'violates' | 'uncertain';
  trustScore: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'calls' | 'imports' | 'exports' | 'extends' | 'implements';
}

export interface CodebaseGraph {
  version: 1;
  created: string;
  updated: string;
  projectRoot: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalFiles: number;
    totalFunctions: number;
    totalExports: number;
    healthScore: number;
  };
}

// ── AST-Free Parser (no dependencies, hackathon-fast) ────────────────────────
// Uses regex + structural analysis instead of ts-morph to avoid dependency hell.
// Good enough for function signatures, exports, imports, and guard clauses.

const FUNCTION_PATTERNS = [
  // export function name(params): returnType
  /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g,
  // export const name = (params): returnType =>
  /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/g,
  // export const name = function(params)
  /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g,
  // class method: name(params): returnType
  /^\s+(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/gm,
];

const CLASS_PATTERN = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+(\w+(?:\s*,\s*\w+)*))?/g;

const IMPORT_PATTERN = /import\s+(?:(?:\{([^}]+)\})|(?:(\w+)))\s+from\s+['"]([^'"]+)['"]/g;

const EXPORT_PATTERN = /export\s+(?:(?:default\s+)?(?:function|class|const|let|var|async)\s+(\w+)|(?:\{([^}]+)\}))/g;

const GUARD_PATTERNS = [
  /if\s*\(\s*!(\w+)\s*\)\s*(?:throw|return)/,
  /if\s*\(\s*(\w+)\s*===?\s*(?:null|undefined|false|''|0)\s*\)\s*(?:throw|return)/,
  /if\s*\(\s*!(\w+)\s*\|\|\s*/,
  /(\w+)\s*\?\?\s*(?:throw|return)/,
];

interface ParsedFunction {
  name: string;
  params: string[];
  returnType: string | null;
  exported: boolean;
  line: number;
  guards: string[];
  calls: string[];
}

interface ParsedFile {
  filePath: string;
  functions: ParsedFunction[];
  imports: { names: string[]; source: string }[];
  exports: string[];
  classes: { name: string; extends_: string | null; line: number }[];
}

function parseFile(filePath: string, content: string): ParsedFile {
  const lines = content.split('\n');
  const functions: ParsedFunction[] = [];
  const imports: { names: string[]; source: string }[] = [];
  const exports: string[] = [];
  const classes: { name: string; extends_: string | null; line: number }[] = [];

  // Parse imports
  let match: RegExpExecArray | null;
  const importRegex = new RegExp(IMPORT_PATTERN.source, 'g');
  while ((match = importRegex.exec(content)) !== null) {
    const namedImports = match[1]?.split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean) ?? [];
    const defaultImport = match[2] ? [match[2]] : [];
    imports.push({
      names: [...namedImports, ...defaultImport],
      source: match[3],
    });
  }

  // Parse exports
  const exportRegex = new RegExp(EXPORT_PATTERN.source, 'g');
  while ((match = exportRegex.exec(content)) !== null) {
    if (match[1]) exports.push(match[1]);
    if (match[2]) {
      match[2].split(',').forEach(e => {
        const name = e.trim().split(/\s+as\s+/)[0].trim();
        if (name) exports.push(name);
      });
    }
  }

  // Parse classes
  const classRegex = new RegExp(CLASS_PATTERN.source, 'g');
  while ((match = classRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    classes.push({
      name: match[1],
      extends_: match[2] || null,
      line: lineNum,
    });
  }

  // Parse functions
  for (const pattern of FUNCTION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      if (!name || name === 'if' || name === 'for' || name === 'while' || name === 'switch') continue;

      const lineNum = content.substring(0, match.index).split('\n').length;
      const params = match[2]
        ? match[2].split(',').map(p => p.trim()).filter(Boolean)
        : [];
      const returnType = match[3]?.trim() || null;
      const exported = content.substring(Math.max(0, match.index - 20), match.index).includes('export') ||
                       exports.includes(name);

      // Find guard clauses in the function body (first 10 lines)
      const bodyStart = lineNum - 1;
      const bodyLines = lines.slice(bodyStart, bodyStart + 10).join('\n');
      const guards: string[] = [];
      for (const guardPattern of GUARD_PATTERNS) {
        const guardMatch = bodyLines.match(guardPattern);
        if (guardMatch) {
          guards.push(guardMatch[0].trim());
        }
      }

      // Find function calls in the body (next 50 lines)
      const fullBody = lines.slice(bodyStart, bodyStart + 50).join('\n');
      const callPattern = /(?<!\w)(\w+)\s*\(/g;
      const calls: string[] = [];
      let callMatch: RegExpExecArray | null;
      while ((callMatch = callPattern.exec(fullBody)) !== null) {
        const calledName = callMatch[1];
        if (calledName !== name && !['if', 'for', 'while', 'switch', 'return', 'throw', 'new', 'catch', 'typeof', 'instanceof', 'await', 'async', 'console', 'require', 'import'].includes(calledName)) {
          if (!calls.includes(calledName)) calls.push(calledName);
        }
      }

      functions.push({
        name,
        params,
        returnType,
        exported,
        line: lineNum,
        guards,
        calls,
      });
    }
  }

  return { filePath, functions, imports, exports, classes };
}

// ── File Discovery ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', '__pycache__', '.corpus',
  'coverage', '.turbo', '.cache', 'build', '.vercel',
]);

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function discoverFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      const fullPath = path.join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (CODE_EXTENSIONS.has(path.extname(entry))) {
          files.push(fullPath);
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  walk(rootDir);
  return files;
}

// ── Graph Builder ────────────────────────────────────────────────────────────

export function buildGraph(projectRoot: string): CodebaseGraph {
  const files = discoverFiles(projectRoot);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const parsedFiles: ParsedFile[] = [];

  // Parse all files
  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseFile(filePath, content);
      parsedFiles.push(parsed);
    } catch {
      // Skip unparseable files
    }
  }

  // Build node map for lookups
  const functionMap = new Map<string, string>(); // functionName -> nodeId

  // Create nodes
  for (const file of parsedFiles) {
    const relPath = path.relative(projectRoot, file.filePath);

    // Module node
    const moduleId = `mod:${relPath}`;
    nodes.push({
      id: moduleId,
      type: 'module',
      name: path.basename(relPath, path.extname(relPath)),
      file: relPath,
      line: 1,
      exported: true,
      params: [],
      returnType: null,
      guards: [],
      health: 'verified',
      trustScore: 100,
    });

    // Function nodes
    for (const fn of file.functions) {
      const nodeId = `fn:${relPath}:${fn.name}`;
      nodes.push({
        id: nodeId,
        type: 'function',
        name: fn.name,
        file: relPath,
        line: fn.line,
        exported: fn.exported,
        params: fn.params,
        returnType: fn.returnType,
        guards: fn.guards,
        health: 'verified',
        trustScore: 100,
      });
      functionMap.set(`${relPath}:${fn.name}`, nodeId);
      if (fn.exported) {
        functionMap.set(fn.name, nodeId);
      }

      // Edge: function belongs to module
      edges.push({ source: moduleId, target: nodeId, type: 'exports' });
    }

    // Class nodes
    for (const cls of file.classes) {
      const nodeId = `cls:${relPath}:${cls.name}`;
      nodes.push({
        id: nodeId,
        type: 'class',
        name: cls.name,
        file: relPath,
        line: cls.line,
        exported: file.exports.includes(cls.name),
        params: [],
        returnType: null,
        guards: [],
        health: 'verified',
        trustScore: 100,
      });

      if (cls.extends_) {
        // We'll resolve the edge after all nodes are created
        edges.push({ source: nodeId, target: `cls:*:${cls.extends_}`, type: 'extends' });
      }
    }

    // Import edges (module -> module)
    for (const imp of file.imports) {
      if (imp.source.startsWith('.')) {
        // Local import: resolve relative path
        const targetPath = resolveImportPath(file.filePath, imp.source, projectRoot);
        if (targetPath) {
          const targetModuleId = `mod:${path.relative(projectRoot, targetPath)}`;
          edges.push({ source: moduleId, target: targetModuleId, type: 'imports' });
        }
      }
    }
  }

  // Build call edges
  for (const file of parsedFiles) {
    const relPath = path.relative(projectRoot, file.filePath);
    for (const fn of file.functions) {
      const sourceId = `fn:${relPath}:${fn.name}`;
      for (const calledName of fn.calls) {
        // Try to resolve the called function
        const targetId = functionMap.get(`${relPath}:${calledName}`) ||
                         functionMap.get(calledName);
        if (targetId) {
          edges.push({ source: sourceId, target: targetId, type: 'calls' });
        }
      }
    }
  }

  // Resolve wildcard class extensions
  for (const edge of edges) {
    if (edge.target.startsWith('cls:*:')) {
      const className = edge.target.replace('cls:*:', '');
      const resolved = nodes.find(n => n.type === 'class' && n.name === className);
      if (resolved) {
        edge.target = resolved.id;
      }
    }
  }

  // Compute health score
  const totalFunctions = nodes.filter(n => n.type === 'function').length;
  const totalExports = nodes.filter(n => n.exported && n.type === 'function').length;
  const healthScore = nodes.length > 0
    ? Math.round(nodes.reduce((sum, n) => sum + n.trustScore, 0) / nodes.length)
    : 100;

  return {
    version: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    projectRoot,
    nodes,
    edges,
    stats: {
      totalFiles: files.length,
      totalFunctions,
      totalExports,
      healthScore,
    },
  };
}

function resolveImportPath(fromFile: string, importPath: string, projectRoot: string): string | null {
  const dir = path.dirname(fromFile);
  const candidates = [
    path.resolve(dir, importPath + '.ts'),
    path.resolve(dir, importPath + '.tsx'),
    path.resolve(dir, importPath + '.js'),
    path.resolve(dir, importPath + '.jsx'),
    path.resolve(dir, importPath, 'index.ts'),
    path.resolve(dir, importPath, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Try without extension (might already have one)
  if (existsSync(path.resolve(dir, importPath))) {
    return path.resolve(dir, importPath);
  }
  return null;
}

// ── Diff Engine (for MCP auto-fix) ──────────────────────────────────────────

export interface GraphDiff {
  added: GraphNode[];
  removed: GraphNode[];
  modified: { before: GraphNode; after: GraphNode; changes: string[] }[];
  verdict: 'VERIFIED' | 'VIOLATES' | 'UNCERTAIN';
  violations: string[];
}

export function diffFile(
  graph: CodebaseGraph,
  filePath: string,
  newContent: string
): GraphDiff {
  const relPath = path.relative(graph.projectRoot, filePath);
  const oldNodes = graph.nodes.filter(n => n.file === relPath && n.type === 'function');
  const parsed = parseFile(filePath, newContent);
  const newFunctions = parsed.functions;

  const added: GraphNode[] = [];
  const removed: GraphNode[] = [];
  const modified: { before: GraphNode; after: GraphNode; changes: string[] }[] = [];
  const violations: string[] = [];

  // Find removed functions
  for (const oldNode of oldNodes) {
    const stillExists = newFunctions.find(f => f.name === oldNode.name);
    if (!stillExists) {
      removed.push(oldNode);
      if (oldNode.exported) {
        violations.push(
          `REMOVED: Exported function '${oldNode.name}' was removed from ${relPath}. ` +
          `This function may be used by other modules. Restore it or update all callers.`
        );
      }
    }
  }

  // Find added and modified functions
  for (const newFn of newFunctions) {
    const oldNode = oldNodes.find(n => n.name === newFn.name);
    if (!oldNode) {
      // New function
      added.push({
        id: `fn:${relPath}:${newFn.name}`,
        type: 'function',
        name: newFn.name,
        file: relPath,
        line: newFn.line,
        exported: newFn.exported,
        params: newFn.params,
        returnType: newFn.returnType,
        guards: newFn.guards,
        health: 'uncertain',
        trustScore: 80,
      });
    } else {
      // Check for modifications
      const changes: string[] = [];

      // Check params changed
      if (JSON.stringify(oldNode.params) !== JSON.stringify(newFn.params)) {
        changes.push(`Parameters changed: [${oldNode.params.join(', ')}] -> [${newFn.params.join(', ')}]`);
      }

      // Check return type changed
      if (oldNode.returnType !== newFn.returnType) {
        changes.push(`Return type changed: ${oldNode.returnType || 'unknown'} -> ${newFn.returnType || 'unknown'}`);
      }

      // Check guard clauses removed (CRITICAL)
      for (const oldGuard of oldNode.guards) {
        if (!newFn.guards.some(g => g.includes(oldGuard.split('(')[0]))) {
          changes.push(`Guard clause REMOVED: ${oldGuard}`);
          violations.push(
            `GUARD REMOVED: Function '${newFn.name}' in ${relPath} had a safety guard '${oldGuard}' ` +
            `that was removed. This may introduce a security vulnerability. Restore the guard clause.`
          );
        }
      }

      if (changes.length > 0) {
        modified.push({
          before: oldNode,
          after: {
            ...oldNode,
            params: newFn.params,
            returnType: newFn.returnType,
            guards: newFn.guards,
            health: violations.length > 0 ? 'violates' : 'uncertain',
            trustScore: Math.max(0, oldNode.trustScore - (violations.length * 20)),
          },
          changes,
        });
      }
    }
  }

  const verdict: 'VERIFIED' | 'VIOLATES' | 'UNCERTAIN' =
    violations.length > 0 ? 'VIOLATES' :
    (added.length > 0 || modified.length > 0) ? 'UNCERTAIN' :
    'VERIFIED';

  return { added, removed, modified, verdict, violations };
}

// ── Save/Load ────────────────────────────────────────────────────────────────

export function saveGraph(graph: CodebaseGraph, projectRoot: string): string {
  const corpusDir = path.join(projectRoot, '.corpus');
  if (!existsSync(corpusDir)) {
    mkdirSync(corpusDir, { recursive: true });
  }
  const graphPath = path.join(corpusDir, 'graph.json');
  writeFileSync(graphPath, JSON.stringify(graph, null, 2));
  return graphPath;
}

export function loadGraph(projectRoot: string): CodebaseGraph | null {
  const graphPath = path.join(projectRoot, '.corpus', 'graph.json');
  if (!existsSync(graphPath)) return null;
  try {
    return JSON.parse(readFileSync(graphPath, 'utf-8'));
  } catch {
    return null;
  }
}
