import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * GET /api/graph
 *
 * Returns the codebase graph for visualization.
 * First tries InsForge database (corpus_scans + corpus_memory tables),
 * then falls back to local .corpus/graph.json.
 */

function transformNodes(nodes: any[]) {
  return nodes.map((node: any) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    file: node.file,
    line: node.line,
    exported: node.exported,
    health: node.health,
    trustScore: node.trustScore,
    guards: node.guards,
    params: node.params,
    color: node.health === 'verified' ? '#10b981'
         : node.health === 'violates' ? '#ef4444'
         : '#f59e0b',
    size: node.type === 'module' ? 12
        : node.type === 'class' ? 10
        : node.exported ? 8 : 5,
  }));
}

function transformEdges(edges: any[], visualNodes: any[]) {
  return edges
    .filter((edge: any) => {
      return visualNodes.some((n: any) => n.id === edge.source) &&
             visualNodes.some((n: any) => n.id === edge.target);
    })
    .map((edge: any) => ({
      source: edge.source,
      target: edge.target,
      type: edge.type,
      color: edge.type === 'calls' ? '#6366f1'
           : edge.type === 'imports' ? '#8b5cf6'
           : edge.type === 'exports' ? '#10b981'
           : edge.type === 'extends' ? '#f59e0b'
           : '#64748b',
    }));
}

async function fetchFromInsForge(projectSlug: string) {
  if (!isSupabaseConfigured()) return null;

  try {
    // Get the latest scan for this project
    const { data: scan, error: scanError } = await supabase
      .from('corpus_scans')
      .select('*')
      .eq('project_slug', projectSlug)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (scanError || !scan) return null;

    // Get graph nodes from corpus_memory
    const { data: memoryRows, error: memError } = await supabase
      .from('corpus_memory')
      .select('*')
      .eq('project_slug', projectSlug)
      .eq('memory_type', 'graph_node')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (memError || !memoryRows || memoryRows.length === 0) return null;

    const nodes = memoryRows.map((row: any) => {
      try {
        return JSON.parse(row.content);
      } catch {
        return null;
      }
    }).filter(Boolean);

    return {
      nodes,
      stats: {
        totalFiles: scan.total_files,
        totalFunctions: scan.total_functions,
        totalExports: 0,
        healthScore: scan.health_score,
      },
      created: scan.created_at,
      updated: scan.created_at,
    };
  } catch {
    return null;
  }
}

function findGraphFile(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, '.corpus', 'graph.json');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const projectRoot = searchParams.get('root') || process.cwd();
  const projectSlug = searchParams.get('project') || 'default';

  // Strategy 1: Try InsForge database first
  const insForgeData = await fetchFromInsForge(projectSlug);

  if (insForgeData) {
    const visualNodes = transformNodes(insForgeData.nodes);
    // InsForge memory doesn't store edges separately, so return nodes-only graph
    return NextResponse.json({
      nodes: visualNodes,
      edges: [],
      stats: insForgeData.stats,
      created: insForgeData.created,
      updated: insForgeData.updated,
      source: 'insforge',
    });
  }

  // Strategy 2: Fall back to local .corpus/graph.json
  const graphPath = findGraphFile(projectRoot);

  if (!graphPath) {
    return NextResponse.json({
      error: 'No corpus graph found. Run `corpus init` to build the immune system.',
      nodes: [],
      edges: [],
      stats: { totalFiles: 0, totalFunctions: 0, totalExports: 0, healthScore: 0 },
    }, { status: 404 });
  }

  try {
    const graph = JSON.parse(readFileSync(graphPath, 'utf-8'));
    const visualNodes = transformNodes(graph.nodes);
    const visualEdges = transformEdges(graph.edges, visualNodes);

    return NextResponse.json({
      nodes: visualNodes,
      edges: visualEdges,
      stats: graph.stats,
      created: graph.created,
      updated: graph.updated,
      source: 'local',
    });
  } catch (e) {
    return NextResponse.json({
      error: 'Failed to parse graph',
      nodes: [],
      edges: [],
      stats: { totalFiles: 0, totalFunctions: 0, totalExports: 0, healthScore: 0 },
    }, { status: 500 });
  }
}
