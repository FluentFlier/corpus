'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { NavBar } from '../../components/NavBar';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface GraphNode {
  id: string; name: string; type: string; file: string; line: number;
  health: string; trustScore: number; exported: boolean;
  guards: string[]; params: string[]; color: string; size: number;
}
interface GraphEdge { source: string; target: string; type: string; color: string; }
interface GraphData {
  nodes: GraphNode[]; edges: GraphEdge[];
  stats: { totalFiles: number; totalFunctions: number; totalExports: number; healthScore: number; };
}

interface BenchmarkEntry {
  repo: string; files: number; functions: number; exports: number;
  classes: number; nodes: number; edges: number; scanTimeMs: number; healthScore: number;
}
interface BenchmarkData {
  benchmarks: BenchmarkEntry[];
  totalReposScanned: number; totalFilesScanned: number; totalFunctionsFound: number;
  totalNodes: number; totalEdges: number; totalScanTimeMs: number;
}

const COLORS: Record<string, string> = {
  core: '#3b82f6', cli: '#f97316', web: '#a855f7', 'mcp-server': '#06b6d4',
  'sdk-ts': '#eab308', 'sdk-python': '#10b981', functions: '#f43f5e',
  policies: '#8b5cf6', schema: '#64748b',
};

const FINDINGS = [
  {
    repo: 'honojs/hono',
    repoUrl: 'https://github.com/honojs/hono',
    count: 60,
    severity: 'high',
    summary: 'Disabled auth middleware patterns, hardcoded IP allow-lists, unguarded route handlers',
  },
  {
    repo: 'drizzle-team/drizzle-orm',
    repoUrl: 'https://github.com/drizzle-team/drizzle-orm',
    count: 37,
    severity: 'medium',
    summary: 'Sensitive data in console.log statements, unvalidated query parameters',
  },
  {
    repo: 'trpc/trpc',
    repoUrl: 'https://github.com/trpc/trpc',
    count: 8,
    severity: 'low',
    summary: 'Hardcoded localhost URLs, development-only endpoints exposed',
  },
];

function getCluster(file: string): string {
  const p = file.split('/');
  if (p[0] === 'packages' && p[1]) return p[1];
  if (p[0] === 'apps' && p[1]) return p[1];
  return p[0] || 'root';
}

function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    high: { bg: '#dc262620', fg: '#f87171', label: 'High' },
    medium: { bg: '#f59e0b18', fg: '#fbbf24', label: 'Medium' },
    low: { bg: '#3b82f615', fg: '#60a5fa', label: 'Low' },
  };
  const s = map[severity] || map.low;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
      background: s.bg, color: s.fg, textTransform: 'uppercase',
    }}>{s.label}</span>
  );
}

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<'explorer' | 'visual'>('visual');

  useEffect(() => {
    // Try API first, fall back to static graph.json
    fetch('/api/graph')
      .then(r => r.json())
      .then(d => {
        if (d.nodes?.length) { setData(d); setLoading(false); }
        else throw new Error('empty');
      })
      .catch(() => {
        fetch('/graph.json')
          .then(r => r.json())
          .then(d => { setData(d); setLoading(false); })
          .catch(() => setLoading(false));
      });
    fetch('/benchmarks.json').then(r => r.json()).then(d => setBenchmarks(d)).catch(() => {});
  }, []);

  // Group nodes by cluster
  const clusters = useMemo(() => {
    if (!data?.nodes?.length) return [];
    const groups = new Map<string, GraphNode[]>();
    data.nodes.forEach(n => {
      const c = getCluster(n.file);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c)!.push(n);
    });
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [data]);

  const totalNodes = useMemo(() => clusters.reduce((s, [, n]) => s + n.length, 0), [clusters]);
  const searchLower = search.toLowerCase();

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#6b7280' }}>Building graph...</div>;
  if (!data?.nodes?.length) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#6b7280', flexDirection: 'column', gap: 16 }}><p style={{ fontSize: 18, color: '#fff' }}>No graph found</p><p>Run <code style={{ color: '#10b981' }}>corpus init</code></p></div>;

  // Build edge lookup for selected node
  const selectedEdges = selected ? data.edges.filter(e => e.source === selected.id || e.target === selected.id) : [];

  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: '#e5e7eb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top bar */}
      <NavBar />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 24px', borderBottom: '1px solid #1f2937', background: '#050505', fontSize: 13,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span><strong>{data.stats.totalFiles}</strong> <span style={{ color: '#6b7280' }}>files</span></span>
          <span><strong>{data.stats.totalFunctions}</strong> <span style={{ color: '#6b7280' }}>functions</span></span>
          <span style={{ color: '#10b981' }}><strong>{data.stats.healthScore}</strong>/100</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <input
            type="text" placeholder="Search nodes..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: '#111', border: '1px solid #1f2937', borderRadius: 6, padding: '6px 12px', color: '#e5e7eb', fontSize: 13, width: 200, outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 4, background: '#111', borderRadius: 6, padding: 2 }}>
            <button
              onClick={() => setView('visual')}
              style={{
                padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                background: view === 'visual' ? '#10b981' : 'transparent',
                color: view === 'visual' ? '#000' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >Visual</button>
            <button
              onClick={() => setView('explorer')}
              style={{
                padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                background: view === 'explorer' ? '#10b981' : 'transparent',
                color: view === 'explorer' ? '#000' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >Explorer</button>
          </div>
        </div>
      </div>

      {/* Visual Graph View */}
      {view === 'visual' && (
        <VisualGraph data={data} clusters={clusters} selected={selected} onSelect={setSelected} search={searchLower} />
      )}

      {/* Explorer View */}
      {view === 'explorer' && <div>
        {/* ── Cluster distribution bar ── */}
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>Cluster distribution</span>
            <span style={{ fontSize: 11, color: '#4b5563' }}>{clusters.length} clusters, {totalNodes} nodes</span>
          </div>
          <svg width="100%" height="32" style={{ display: 'block', borderRadius: 6, overflow: 'hidden' }}>
            {(() => {
              let x = 0;
              return clusters.map(([name, nodes]) => {
                const pct = (nodes.length / totalNodes) * 100;
                const color = COLORS[name] || '#64748b';
                const barX = x;
                x += pct;
                return (
                  <g key={name}>
                    <rect
                      x={`${barX}%`} y="0" width={`${Math.max(pct, 0.3)}%`} height="32"
                      fill={color} opacity={hovered === name ? 0.9 : 0.55}
                      onMouseEnter={() => setHovered(name)}
                      onMouseLeave={() => setHovered(null)}
                      style={{ cursor: 'default', transition: 'opacity 0.15s' }}
                    />
                    {pct > 6 && (
                      <text
                        x={`${barX + pct / 2}%`} y="20" textAnchor="middle"
                        fill="#fff" fontSize="10" fontFamily="system-ui, sans-serif" fontWeight="500"
                        style={{ pointerEvents: 'none' }}
                      >{name} ({nodes.length})</text>
                    )}
                  </g>
                );
              });
            })()}
          </svg>
        </div>

        {/* ── Dependency graph ── */}
        <DependencyGraph clusters={clusters} edges={data.edges} nodes={data.nodes} />

        {/* ── Grid + detail panel ── */}
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 1, padding: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {clusters.map(([clusterName, nodes]) => {
                const color = COLORS[clusterName] || '#64748b';
                const modules = nodes.filter(n => n.type === 'module');
                const funcs = nodes.filter(n => n.type === 'function');
                const filtered = searchLower
                  ? nodes.filter(n => n.name.toLowerCase().includes(searchLower) || n.file.toLowerCase().includes(searchLower))
                  : nodes;

                if (searchLower && filtered.length === 0) return null;

                return (
                  <div
                    key={clusterName}
                    style={{
                      background: '#0a0a0a',
                      border: '1px solid #1a1a1a',
                      borderLeft: `4px solid ${color}`,
                      borderRadius: 8,
                      padding: '14px 16px',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={() => setHovered(clusterName)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* Cluster header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: 16, color: '#f0f0f0' }}>{clusterName}</span>
                      <span style={{
                        background: color + '18', color: color, fontSize: 11, fontWeight: 600,
                        padding: '3px 10px', borderRadius: 12,
                      }}>
                        {nodes.length}
                      </span>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11, color: '#6b7280' }}>
                      <span>{modules.length} files</span>
                      <span style={{ color: '#374151' }}>|</span>
                      <span>{funcs.length} functions</span>
                    </div>

                    {/* Module list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {modules.slice(0, searchLower ? 20 : 12).map(m => {
                        const isMatch = searchLower && m.name.toLowerCase().includes(searchLower);
                        const isSelected = selected?.id === m.id;
                        const fileFuncs = funcs.filter(f => f.file === m.file);

                        return (
                          <div key={m.id}>
                            <div
                              onClick={() => setSelected(isSelected ? null : m)}
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                                background: isSelected ? color + '15' : isMatch ? '#10b98110' : 'transparent',
                                border: isSelected ? `1px solid ${color}40` : '1px solid transparent',
                                transition: 'all 0.15s',
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                                  background: color, opacity: isSelected ? 1 : 0.5, flexShrink: 0,
                                }} />
                                <span style={{
                                  fontSize: 12, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                                  color: isSelected ? '#fff' : isMatch ? '#10b981' : '#9ca3af',
                                }}>
                                  {m.name}
                                </span>
                              </span>
                              {fileFuncs.length > 0 && (
                                <span style={{
                                  fontSize: 10, color: '#6b7280', background: '#ffffff08',
                                  padding: '1px 6px', borderRadius: 8, fontWeight: 500,
                                }}>
                                  {fileFuncs.length}
                                </span>
                              )}
                            </div>

                            {/* Expanded: show functions in this module */}
                            {isSelected && fileFuncs.length > 0 && (
                              <div style={{ paddingLeft: 20, marginTop: 2, marginBottom: 4 }}>
                                {fileFuncs.map(f => (
                                  <div
                                    key={f.id}
                                    onClick={(e) => { e.stopPropagation(); setSelected(f); }}
                                    style={{
                                      fontSize: 11, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', color: '#6b7280',
                                      padding: '3px 8px', cursor: 'pointer', borderRadius: 4,
                                      borderLeft: `2px solid ${color}40`,
                                      background: selected?.id === f.id ? color + '10' : 'transparent',
                                    }}
                                  >
                                    <span style={{ color: f.exported ? '#a5b4fc' : '#6b7280' }}>{f.name}</span>
                                    <span style={{ color: '#374151', marginLeft: 4 }}>
                                      ({f.params?.length || 0})
                                    </span>
                                    {f.guards?.length > 0 && (
                                      <span style={{ color: '#10b981', marginLeft: 4, fontSize: 9 }}>guarded</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {modules.length > 12 && !searchLower && (
                        <div style={{ fontSize: 11, color: '#4b5563', padding: '4px 8px' }}>
                          +{modules.length - 12} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Findings from Real Repos ── */}
            <div style={{ marginTop: 40, paddingBottom: 8 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb', margin: '0 0 4px', letterSpacing: '-0.01em' }}>Findings from Real Repos</h2>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>Security and quality issues detected by static analysis across open-source codebases.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {FINDINGS.map(f => (
                  <div key={f.repo} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8,
                    padding: '12px 16px',
                  }}>
                    <div style={{ minWidth: 48, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#f0f0f0' }}>{f.count}</div>
                      <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>findings</div>
                    </div>
                    <div style={{ width: 1, height: 32, background: '#1f2937', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <a href={f.repoUrl} target="_blank" rel="noopener noreferrer" style={{
                          fontSize: 13, fontWeight: 600, color: '#e5e7eb', textDecoration: 'none',
                          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        }}>{f.repo}</a>
                        <SeverityBadge severity={f.severity} />
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.4 }}>{f.summary}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Benchmark table ── */}
            {benchmarks && (
              <div style={{ marginTop: 40, paddingBottom: 48 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb', margin: '0 0 4px', letterSpacing: '-0.01em' }}>Benchmarks</h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>
                  {benchmarks.totalReposScanned} repos scanned. {formatNum(benchmarks.totalFilesScanned)} files, {formatNum(benchmarks.totalFunctionsFound)} functions in {(benchmarks.totalScanTimeMs / 1000).toFixed(1)}s total.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%', borderCollapse: 'collapse', fontSize: 13,
                    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                  }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1f2937' }}>
                        {['Repo', 'Files', 'Functions', 'Nodes', 'Edges', 'Scan Time'].map(h => (
                          <th key={h} style={{
                            textAlign: h === 'Repo' ? 'left' : 'right',
                            padding: '8px 12px', fontSize: 10, fontWeight: 500,
                            color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarks.benchmarks.map(b => (
                        <tr key={b.repo} style={{ borderBottom: '1px solid #111' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <a
                              href={`https://github.com/${b.repo}`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ color: '#a5b4fc', textDecoration: 'none', fontWeight: 500 }}
                            >{b.repo}</a>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#9ca3af' }}>{b.files.toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#9ca3af' }}>{b.functions.toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#9ca3af' }}>{b.nodes.toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#9ca3af' }}>{b.edges.toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#e5e7eb', fontWeight: 600 }}>{b.scanTimeMs}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{
              width: 340, borderLeft: '1px solid #1f2937', padding: 24, position: 'sticky',
              top: 48, height: 'calc(100vh - 48px)', overflow: 'auto', background: '#050505',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{selected.name}</h3>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>x</button>
              </div>

              <div style={{ color: '#6b7280', marginBottom: 12, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 12 }}>
                {selected.file}{selected.line ? `:${selected.line}` : ''}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                <Tag color="#374151">{selected.type}</Tag>
                {selected.exported && <Tag color="#10b981">exported</Tag>}
                <Tag color={COLORS[getCluster(selected.file)] || '#64748b'}>{getCluster(selected.file)}</Tag>
                <Tag color={selected.health === 'verified' ? '#10b981' : '#ef4444'}>{(selected.health || 'verified').toUpperCase()}</Tag>
              </div>

              {selected.params?.length > 0 && (
                <Section title="Parameters">
                  {selected.params.map((p, i) => (
                    <div key={i} style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 12, color: '#a5b4fc', marginBottom: 2 }}>{p}</div>
                  ))}
                </Section>
              )}

              {selected.guards?.length > 0 && (
                <Section title="Guard Clauses">
                  {selected.guards.map((g, i) => (
                    <div key={i} style={{
                      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 11, color: '#6ee7b7',
                      padding: '4px 8px', background: '#10b98108', borderRadius: 4,
                      borderLeft: '2px solid #10b98140', marginBottom: 4,
                    }}>{g}</div>
                  ))}
                </Section>
              )}

              <Section title="Trust Score">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{selected.trustScore}</span>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>/100</span>
                </div>
              </Section>

              {selectedEdges.length > 0 && (
                <Section title={`Connections (${selectedEdges.length})`}>
                  {selectedEdges.slice(0, 10).map((e, i) => {
                    const isOutgoing = e.source === selected.id;
                    const targetId = isOutgoing ? e.target : e.source;
                    const targetNode = data?.nodes.find(n => n.id === targetId);
                    return (
                      <div key={i} style={{ fontSize: 11, color: '#6b7280', marginBottom: 2, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
                        <span style={{ color: '#4b5563' }}>{isOutgoing ? '  ->' : '  <-'}</span>{' '}
                        <span style={{ color: '#9ca3af' }}>{e.type}</span>{' '}
                        <span
                          onClick={() => targetNode && setSelected(targetNode)}
                          style={{ color: '#a5b4fc', cursor: targetNode ? 'pointer' : 'default' }}
                        >
                          {targetNode?.name || targetId.split(':').pop()}
                        </span>
                      </div>
                    );
                  })}
                  {selectedEdges.length > 10 && (
                    <div style={{ fontSize: 11, color: '#4b5563' }}>+{selectedEdges.length - 10} more</div>
                  )}
                </Section>
              )}
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}

// ── Dependency Graph (box diagram with arrows) ──────────────────────────────

function DependencyGraph({
  clusters,
  edges,
  nodes,
}: {
  clusters: [string, GraphNode[]][];
  edges: GraphEdge[];
  nodes: GraphNode[];
}) {
  // Build a lookup: nodeId -> cluster name
  const nodeCluster = useMemo(() => {
    const map = new Map<string, string>();
    nodes.forEach(n => map.set(n.id, getCluster(n.file)));
    return map;
  }, [nodes]);

  // Find cross-cluster connections (deduplicated, directional)
  const connections = useMemo(() => {
    const seen = new Set<string>();
    const result: { from: string; to: string }[] = [];
    edges.forEach(e => {
      const sc = nodeCluster.get(e.source);
      const tc = nodeCluster.get(e.target);
      if (sc && tc && sc !== tc) {
        const key = `${sc}->${tc}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ from: sc, to: tc });
        }
      }
    });
    return result;
  }, [edges, nodeCluster]);

  // Count files per cluster (module-type nodes)
  const fileCounts = useMemo(() => {
    const map = new Map<string, number>();
    clusters.forEach(([name, clusterNodes]) => {
      map.set(name, clusterNodes.filter(n => n.type === 'module').length);
    });
    return map;
  }, [clusters]);

  // Layout: arrange boxes in 2 rows
  const boxW = 120;
  const boxH = 48;
  const gapX = 40;
  const gapY = 36;
  const clusterNames = clusters.map(([name]) => name);
  const topRowCount = Math.ceil(clusterNames.length / 2);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    clusterNames.forEach((name, i) => {
      const row = i < topRowCount ? 0 : 1;
      const col = i < topRowCount ? i : i - topRowCount;
      map.set(name, {
        x: 24 + col * (boxW + gapX),
        y: 16 + row * (boxH + gapY),
      });
    });
    return map;
  }, [clusterNames, topRowCount]);

  const svgW = 24 + Math.max(topRowCount, clusterNames.length - topRowCount) * (boxW + gapX);
  const svgH = 16 + (clusterNames.length > topRowCount ? 2 : 1) * (boxH + gapY) + 8;

  return (
    <div style={{ padding: '16px 24px 0' }}>
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
          Package dependencies
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={svgW} height={svgH} style={{ display: 'block', maxHeight: 200 }}>
          <defs>
            <marker id="dep-arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6" fill="none" stroke="#4b5563" strokeWidth="1" />
            </marker>
          </defs>

          {/* Connection lines */}
          {connections.map(({ from, to }) => {
            const fp = positions.get(from);
            const tp = positions.get(to);
            if (!fp || !tp) return null;

            // Compute edge points from box centers
            const fcx = fp.x + boxW / 2;
            const fcy = fp.y + boxH / 2;
            const tcx = tp.x + boxW / 2;
            const tcy = tp.y + boxH / 2;

            // Determine which side to connect from/to
            const dx = tcx - fcx;
            const dy = tcy - fcy;
            let sx: number, sy: number, ex: number, ey: number;

            if (Math.abs(dx) > Math.abs(dy)) {
              // Horizontal connection
              sx = dx > 0 ? fp.x + boxW : fp.x;
              sy = fcy;
              ex = dx > 0 ? tp.x : tp.x + boxW;
              ey = tcy;
            } else {
              // Vertical connection
              sx = fcx;
              sy = dy > 0 ? fp.y + boxH : fp.y;
              ex = tcx;
              ey = dy > 0 ? tp.y : tp.y + boxH;
            }

            return (
              <line
                key={`${from}-${to}`}
                x1={sx} y1={sy} x2={ex} y2={ey}
                stroke="#4b5563" strokeWidth={1} opacity={0.5}
                markerEnd="url(#dep-arrow)"
              />
            );
          })}

          {/* Boxes */}
          {clusterNames.map(name => {
            const pos = positions.get(name);
            if (!pos) return null;
            const color = COLORS[name] || '#64748b';
            const files = fileCounts.get(name) || 0;

            return (
              <g key={name}>
                <rect
                  x={pos.x} y={pos.y} width={boxW} height={boxH} rx={6}
                  fill={color + '12'} stroke={color + '40'} strokeWidth={1}
                />
                <text
                  x={pos.x + boxW / 2} y={pos.y + 20}
                  textAnchor="middle" fill="#e5e7eb" fontSize={12} fontWeight={600}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {name}
                </text>
                <text
                  x={pos.x + boxW / 2} y={pos.y + 35}
                  textAnchor="middle" fill="#6b7280" fontSize={10}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {files} files
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Force-directed Visual Graph (react-force-graph-2d) ───────────────────────

function VisualGraph({ data, clusters, selected, onSelect, search }: {
  data: GraphData;
  clusters: [string, GraphNode[]][];
  selected: GraphNode | null;
  onSelect: (n: GraphNode | null) => void;
  search: string;
}) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1200, h: 700 });

  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        setDims({ w: containerRef.current.offsetWidth, h: window.innerHeight - 100 });
      }
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Build force-graph data: only modules (files) + cross-file edges for a clean view
  const graphData = useMemo(() => {
    const modules = data.nodes.filter(n => n.type === 'module');
    const moduleIds = new Set(modules.map(n => n.id));

    // For functions, map them to their parent module
    const funcToModule = new Map<string, string>();
    data.nodes.forEach(n => {
      if (n.type === 'function') {
        const modId = `mod:${n.file}`;
        if (moduleIds.has(modId)) funcToModule.set(n.id, modId);
      }
    });

    // Build edges between modules (aggregate function-level edges)
    const edgeSet = new Set<string>();
    const links: { source: string; target: string; type: string }[] = [];
    data.edges.forEach(e => {
      let s = moduleIds.has(e.source) ? e.source : funcToModule.get(e.source);
      let t = moduleIds.has(e.target) ? e.target : funcToModule.get(e.target);
      if (s && t && s !== t) {
        const key = `${s}::${t}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          links.push({ source: s, target: t, type: e.type });
        }
      }
    });

    const nodes = modules.map(n => {
      const cluster = getCluster(n.file);
      const color = COLORS[cluster] || '#64748b';
      const fileFuncs = data.nodes.filter(f => f.type === 'function' && f.file === n.file);
      const isMatch = search && (n.name.toLowerCase().includes(search) || n.file.toLowerCase().includes(search));
      return {
        id: n.id,
        name: n.name,
        file: n.file,
        cluster,
        color,
        funcCount: fileFuncs.length,
        exported: n.exported,
        val: Math.max(2, fileFuncs.length + 1),
        isMatch,
        _original: n,
      };
    });

    return { nodes, links };
  }, [data, search]);

  const handleNodeClick = useCallback((node: any) => {
    onSelect(node._original);
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 400);
      fgRef.current.zoom(3, 400);
    }
  }, [onSelect]);

  // Paint nodes with canvas for performance
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const r = Math.sqrt(node.val) * 2.5;
    const isSelected = selected?.id === node.id;
    const isMatch = node.isMatch;
    const isDimmed = search && !isMatch;
    const color = node.color;

    ctx.globalAlpha = isDimmed ? 0.15 : 1;

    // Glow for selected
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 6, 0, 2 * Math.PI);
      ctx.fillStyle = color + '30';
      ctx.fill();
    }

    // Match ring
    if (isMatch) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = isSelected ? color : color + '90';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = (isSelected ? 2 : 0.5) / globalScale;
    ctx.stroke();

    // Label (show at reasonable zoom)
    if (globalScale > 0.8 || isSelected || isMatch) {
      ctx.font = `${(isSelected ? 600 : 400)} ${Math.max(10, 12 / globalScale)}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isSelected ? '#fff' : isDimmed ? '#ffffff20' : '#ffffffaa';
      ctx.fillText(node.name, node.x, node.y + r + 2);

      // Function count
      if (node.funcCount > 0 && globalScale > 1.2) {
        ctx.font = `400 ${Math.max(8, 9 / globalScale)}px system-ui`;
        ctx.fillStyle = color + '99';
        ctx.fillText(`${node.funcCount} fn`, node.x, node.y + r + 14 / globalScale + 2);
      }
    }

    ctx.globalAlpha = 1;
  }, [selected, search]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: dims.h, background: '#050505' }}>
      <ForceGraph2D
        ref={fgRef}
        width={dims.w}
        height={dims.h}
        graphData={graphData}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          const r = Math.sqrt(node.val) * 2.5 + 4;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={() => '#ffffff10'}
        linkWidth={0.5}
        linkDirectionalParticles={0}
        onNodeClick={handleNodeClick}
        backgroundColor="#050505"
        cooldownTicks={80}
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.3}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        display: 'flex', gap: 12, fontSize: 10, fontFamily: 'ui-monospace, monospace',
        background: '#0a0a0acc', backdropFilter: 'blur(4px)', padding: '6px 12px', borderRadius: 8,
      }}>
        {clusters.slice(0, 7).map(([name]) => (
          <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, color: COLORS[name] || '#64748b' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS[name] || '#64748b' }} />
            {name}
          </span>
        ))}
      </div>

      {/* Selected detail overlay */}
      {selected && (
        <div style={{
          position: 'absolute', top: 12, right: 16, width: 300,
          background: '#0a0a0aee', backdropFilter: 'blur(8px)',
          border: '1px solid #1f2937', borderRadius: 12, padding: 16,
          fontSize: 13, color: '#e5e7eb',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ fontSize: 15 }}>{selected.name}</strong>
            <button onClick={() => onSelect(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>x</button>
          </div>
          <div style={{ color: '#6b7280', fontFamily: 'ui-monospace, monospace', fontSize: 11, marginBottom: 8 }}>{selected.file}:{selected.line}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            <Tag color={COLORS[getCluster(selected.file)] || '#64748b'}>{getCluster(selected.file)}</Tag>
            <Tag color="#374151">{selected.type}</Tag>
            {selected.exported && <Tag color="#10b981">exported</Tag>}
          </div>
          {selected.params?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>params</div>
              {selected.params.map((p, i) => (
                <div key={i} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#a5b4fc', marginBottom: 1 }}>{p}</div>
              ))}
            </div>
          )}
          {selected.guards?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>guards</div>
              {selected.guards.map((g, i) => (
                <div key={i} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#6ee7b7', borderLeft: '2px solid #10b98140', paddingLeft: 6, marginBottom: 2 }}>{g}</div>
              ))}
            </div>
          )}
          <div style={{ color: '#10b981', fontSize: 20, fontWeight: 700 }}>{selected.trustScore}<span style={{ color: '#6b7280', fontSize: 12, fontWeight: 400 }}>/100</span></div>
        </div>
      )}
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
      background: color + '15', color: color, border: `1px solid ${color}30`,
    }}>{children}</span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      {children}
    </div>
  );
}
