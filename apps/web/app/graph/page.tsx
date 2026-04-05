'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { NavBar } from '../../components/NavBar';

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

// ── Layered Visual Graph (packages → files → functions) ──────────────────────

function VisualGraph({ data, clusters, selected, onSelect, search }: {
  data: GraphData;
  clusters: [string, GraphNode[]][];
  selected: GraphNode | null;
  onSelect: (n: GraphNode | null) => void;
  search: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null); // cluster name
  const [expandedFile, setExpandedFile] = useState<string | null>(null); // file path

  const W = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const H = typeof window !== 'undefined' ? window.innerHeight - 100 : 650;
  const centerX = W / 2;
  const centerY = H / 2;

  // Cross-cluster edge counts for line thickness
  const crossEdges = useMemo(() => {
    const counts = new Map<string, number>();
    data.edges.forEach(e => {
      const sc = clusters.find(([, ns]) => ns.some(n => n.id === e.source))?.[0];
      const tc = clusters.find(([, ns]) => ns.some(n => n.id === e.target))?.[0];
      if (sc && tc && sc !== tc) {
        const key = [sc, tc].sort().join('::');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    return counts;
  }, [data.edges, clusters]);

  // ── LAYER 1: Package overview ──
  if (!expanded) {
    const orbitR = Math.min(W, H) * 0.28;
    const positions = clusters.map(([name, nodes], i) => {
      const angle = (i / clusters.length) * Math.PI * 2 - Math.PI / 2;
      const modules = nodes.filter(n => n.type === 'module').length;
      const funcs = nodes.filter(n => n.type === 'function').length;
      const r = Math.max(32, Math.sqrt(nodes.length) * 6);
      return {
        name, nodes, modules, funcs, r,
        cx: centerX + Math.cos(angle) * orbitR,
        cy: centerY + Math.sin(angle) * orbitR,
        color: COLORS[name] || '#64748b',
      };
    });

    return (
      <div style={{ position: 'relative', width: '100%', height: H, overflow: 'hidden' }}>
        <svg width={W} height={H} style={{ background: '#050505' }}>
          {/* Center label */}
          <text x={centerX} y={centerY - 12} textAnchor="middle" fill="#ffffff20" fontSize={14} fontWeight={700} fontFamily="system-ui">corpus</text>
          <text x={centerX} y={centerY + 8} textAnchor="middle" fill="#ffffff10" fontSize={11} fontFamily="system-ui">{data.stats.totalFiles} files · {data.stats.totalFunctions} functions</text>

          {/* Cross-cluster edges */}
          {positions.map((a, ai) =>
            positions.slice(ai + 1).map(b => {
              const key = [a.name, b.name].sort().join('::');
              const count = crossEdges.get(key) || 0;
              if (count === 0) return null;
              return (
                <line key={key} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
                  stroke="#ffffff" strokeWidth={Math.min(count * 0.3, 3)} opacity={0.06}
                />
              );
            })
          )}

          {/* Package nodes */}
          {positions.map(p => (
            <g key={p.name} onClick={() => setExpanded(p.name)} style={{ cursor: 'pointer' }}>
              {/* Glow */}
              <circle cx={p.cx} cy={p.cy} r={p.r + 16} fill={p.color} opacity={0.04} />
              {/* Ring */}
              <circle cx={p.cx} cy={p.cy} r={p.r} fill={p.color + '15'} stroke={p.color} strokeWidth={1.5} opacity={0.7} />
              {/* Name */}
              <text x={p.cx} y={p.cy - 4} textAnchor="middle" fill="#e5e7eb" fontSize={13} fontWeight={700} fontFamily="system-ui">
                {p.name}
              </text>
              {/* Stats */}
              <text x={p.cx} y={p.cy + 12} textAnchor="middle" fill={p.color} fontSize={10} fontFamily="system-ui">
                {p.modules} files · {p.funcs} fn
              </text>
            </g>
          ))}
        </svg>

        {/* Breadcrumb */}
        <div style={{ position: 'absolute', top: 12, left: 16, fontSize: 12, color: '#6b7280', fontFamily: 'ui-monospace, monospace' }}>
          <span style={{ color: '#10b981' }}>corpus</span>
          <span style={{ color: '#333', margin: '0 6px' }}>/</span>
          <span>click a package to drill in</span>
        </div>
      </div>
    );
  }

  // ── LAYER 2: Files within a package ──
  const clusterNodes = clusters.find(([n]) => n === expanded)?.[1] || [];
  const clusterColor = COLORS[expanded] || '#64748b';
  const files = clusterNodes.filter(n => n.type === 'module');
  const funcs = clusterNodes.filter(n => n.type === 'function');

  if (!expandedFile) {
    const fileOrbit = Math.min(W, H) * 0.3;
    const filePositions = files.map((f, i) => {
      const angle = (i / files.length) * Math.PI * 2 - Math.PI / 2;
      const fileFuncs = funcs.filter(fn => fn.file === f.file);
      const r = Math.max(18, Math.sqrt(fileFuncs.length + 1) * 8);
      return {
        ...f, fileFuncs, r,
        cx: centerX + Math.cos(angle) * fileOrbit,
        cy: centerY + Math.sin(angle) * fileOrbit,
      };
    });

    // Intra-cluster edges between files
    const fileEdges: { from: typeof filePositions[0]; to: typeof filePositions[0] }[] = [];
    data.edges.forEach(e => {
      const sf = filePositions.find(f => f.id === e.source || funcs.find(fn => fn.id === e.source && fn.file === f.file));
      const tf = filePositions.find(f => f.id === e.target || funcs.find(fn => fn.id === e.target && fn.file === f.file));
      if (sf && tf && sf.id !== tf.id && !fileEdges.some(fe => (fe.from.id === sf.id && fe.to.id === tf.id) || (fe.from.id === tf.id && fe.to.id === sf.id))) {
        fileEdges.push({ from: sf, to: tf });
      }
    });

    return (
      <div style={{ position: 'relative', width: '100%', height: H, overflow: 'hidden' }}>
        <svg width={W} height={H} style={{ background: '#050505' }}>
          {/* Center label */}
          <text x={centerX} y={centerY - 8} textAnchor="middle" fill={clusterColor} fontSize={16} fontWeight={700} fontFamily="system-ui">{expanded}</text>
          <text x={centerX} y={centerY + 10} textAnchor="middle" fill="#ffffff15" fontSize={11} fontFamily="system-ui">{files.length} files · {funcs.length} functions</text>

          {/* File-to-file edges */}
          {fileEdges.map((e, i) => (
            <line key={i} x1={e.from.cx} y1={e.from.cy} x2={e.to.cx} y2={e.to.cy}
              stroke={clusterColor} strokeWidth={0.5} opacity={0.15}
            />
          ))}

          {/* File nodes */}
          {filePositions.map(f => {
            const isMatch = search && f.name.toLowerCase().includes(search);
            return (
              <g key={f.id} onClick={() => setExpandedFile(f.file)} style={{ cursor: 'pointer' }}
                opacity={search && !isMatch ? 0.2 : 1}>
                <circle cx={f.cx} cy={f.cy} r={f.r + 8} fill={clusterColor} opacity={0.03} />
                <circle cx={f.cx} cy={f.cy} r={f.r} fill={clusterColor + '18'} stroke={clusterColor} strokeWidth={1} opacity={0.6} />
                {isMatch && <circle cx={f.cx} cy={f.cy} r={f.r + 4} stroke="#10b981" strokeWidth={1.5} fill="none" />}
                <text x={f.cx} y={f.cy - 2} textAnchor="middle" fill="#e5e7eb" fontSize={10} fontWeight={600} fontFamily="ui-monospace, monospace">
                  {f.name}
                </text>
                <text x={f.cx} y={f.cy + 10} textAnchor="middle" fill={clusterColor} fontSize={9} fontFamily="system-ui">
                  {f.fileFuncs.length} fn
                </text>
              </g>
            );
          })}
        </svg>

        {/* Breadcrumb */}
        <div style={{ position: 'absolute', top: 12, left: 16, fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
          <span onClick={() => setExpanded(null)} style={{ color: '#10b981', cursor: 'pointer' }}>corpus</span>
          <span style={{ color: '#333', margin: '0 6px' }}>/</span>
          <span style={{ color: clusterColor }}>{expanded}</span>
          <span style={{ color: '#333', margin: '0 6px' }}>/</span>
          <span style={{ color: '#6b7280' }}>click a file</span>
        </div>
      </div>
    );
  }

  // ── LAYER 3: Functions within a file ──
  const fileFuncs = funcs.filter(f => f.file === expandedFile);
  const fileModule = files.find(f => f.file === expandedFile);
  const fileName = expandedFile.split('/').pop() || expandedFile;
  const funcOrbit = Math.min(W, H) * 0.28;

  const funcPositions = fileFuncs.map((f, i) => {
    const angle = (i / Math.max(fileFuncs.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = f.exported ? 22 : 16;
    return {
      ...f, r,
      cx: centerX + Math.cos(angle) * funcOrbit,
      cy: centerY + Math.sin(angle) * funcOrbit,
    };
  });

  // Edges between functions in this file
  const funcEdges: { from: typeof funcPositions[0]; to: typeof funcPositions[0]; type: string }[] = [];
  data.edges.forEach(e => {
    const sf = funcPositions.find(f => f.id === e.source);
    const tf = funcPositions.find(f => f.id === e.target);
    if (sf && tf) funcEdges.push({ from: sf, to: tf, type: e.type });
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: H, overflow: 'hidden' }}>
      <svg width={W} height={H} style={{ background: '#050505' }}>
        {/* Center: file name */}
        <text x={centerX} y={centerY - 8} textAnchor="middle" fill={clusterColor} fontSize={14} fontWeight={700} fontFamily="ui-monospace, monospace">{fileName}</text>
        <text x={centerX} y={centerY + 10} textAnchor="middle" fill="#ffffff15" fontSize={11} fontFamily="system-ui">{fileFuncs.length} functions</text>

        {/* Function edges */}
        {funcEdges.map((e, i) => (
          <line key={i} x1={e.from.cx} y1={e.from.cy} x2={e.to.cx} y2={e.to.cy}
            stroke={e.type === 'calls' ? '#6366f1' : clusterColor} strokeWidth={1} opacity={0.2}
          />
        ))}

        {/* Function nodes */}
        {funcPositions.map(f => {
          const isSelected = selected?.id === f.id;
          const isMatch = search && f.name.toLowerCase().includes(search);
          const hasGuards = f.guards?.length > 0;
          return (
            <g key={f.id} onClick={() => onSelect(isSelected ? null : f)} style={{ cursor: 'pointer' }}
              opacity={search && !isMatch ? 0.2 : 1}>
              {isSelected && <circle cx={f.cx} cy={f.cy} r={f.r + 10} fill={clusterColor} opacity={0.1} />}
              {isMatch && <circle cx={f.cx} cy={f.cy} r={f.r + 6} stroke="#10b981" strokeWidth={1.5} fill="none" />}
              <circle cx={f.cx} cy={f.cy} r={f.r}
                fill={isSelected ? clusterColor + '30' : clusterColor + '12'}
                stroke={hasGuards ? '#10b981' : f.exported ? clusterColor : '#333'}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text x={f.cx} y={f.cy + 1} textAnchor="middle" fill="#e5e7eb" fontSize={10} fontWeight={600} fontFamily="ui-monospace, monospace">
                {f.name}
              </text>
              {f.exported && (
                <text x={f.cx} y={f.cy + 12} textAnchor="middle" fill="#10b981" fontSize={8} fontFamily="system-ui">exported</text>
              )}
              {hasGuards && (
                <text x={f.cx} y={f.cy - f.r - 4} textAnchor="middle" fill="#10b981" fontSize={8} fontFamily="system-ui">guarded</text>
              )}
            </g>
          );
        })}

        {/* If no functions, show the module info */}
        {fileFuncs.length === 0 && fileModule && (
          <text x={centerX} y={centerY + 30} textAnchor="middle" fill="#6b7280" fontSize={12} fontFamily="system-ui">
            Module node only — no extracted functions
          </text>
        )}
      </svg>

      {/* Breadcrumb */}
      <div style={{ position: 'absolute', top: 12, left: 16, fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
        <span onClick={() => { setExpanded(null); setExpandedFile(null); }} style={{ color: '#10b981', cursor: 'pointer' }}>corpus</span>
        <span style={{ color: '#333', margin: '0 6px' }}>/</span>
        <span onClick={() => setExpandedFile(null)} style={{ color: clusterColor, cursor: 'pointer' }}>{expanded}</span>
        <span style={{ color: '#333', margin: '0 6px' }}>/</span>
        <span style={{ color: '#e5e7eb' }}>{fileName}</span>
      </div>

      {/* Selected function detail overlay */}
      {selected && (
        <div style={{
          position: 'absolute', top: 12, right: 16, width: 280,
          background: '#0a0a0aee', backdropFilter: 'blur(8px)',
          border: '1px solid #1f2937', borderRadius: 12, padding: 16,
          fontSize: 13, color: '#e5e7eb',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>{selected.name}</strong>
            <button onClick={() => onSelect(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>x</button>
          </div>
          <div style={{ color: '#6b7280', fontFamily: 'ui-monospace, monospace', fontSize: 10, marginBottom: 8 }}>
            {selected.file}:{selected.line}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
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
          <div style={{ color: '#10b981', fontSize: 18, fontWeight: 700 }}>{selected.trustScore}<span style={{ color: '#6b7280', fontSize: 11, fontWeight: 400 }}>/100</span></div>
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
