import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

/**
 * GET /api/graph
 *
 * Returns the codebase graph for visualization.
 * Reads from .corpus/graph.json in the project root.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const projectRoot = searchParams.get('root') || process.cwd();

  const graphPath = path.join(projectRoot, '.corpus', 'graph.json');

  if (!existsSync(graphPath)) {
    return NextResponse.json({
      error: 'No corpus graph found. Run `corpus init` to build the immune system.',
      nodes: [],
      edges: [],
      stats: { totalFiles: 0, totalFunctions: 0, totalExports: 0, healthScore: 0 },
    }, { status: 404 });
  }

  try {
    const graph = JSON.parse(readFileSync(graphPath, 'utf-8'));

    // Transform for react-force-graph format
    const visualNodes = graph.nodes.map((node: any) => ({
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
      // Visual properties
      color: node.health === 'verified' ? '#10b981'
           : node.health === 'violates' ? '#ef4444'
           : '#f59e0b',
      size: node.type === 'module' ? 12
          : node.type === 'class' ? 10
          : node.exported ? 8 : 5,
    }));

    const visualEdges = graph.edges
      .filter((edge: any) => {
        // Only include edges where both source and target exist
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

    return NextResponse.json({
      nodes: visualNodes,
      edges: visualEdges,
      stats: graph.stats,
      created: graph.created,
      updated: graph.updated,
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
