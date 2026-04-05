'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

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

const COLORS: Record<string, string> = {
  core: '#3b82f6', cli: '#f97316', web: '#a855f7', 'mcp-server': '#06b6d4',
  'sdk-ts': '#eab308', 'sdk-python': '#10b981', functions: '#f43f5e',
  policies: '#8b5cf6', schema: '#64748b',
};

function getCluster(file: string): string {
  const p = file.split('/');
  if (p[0] === 'packages' && p[1]) return p[1];
  if (p[0] === 'apps' && p[1]) return p[1];
  return p[0] || 'root';
}

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/graph').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
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

  const searchLower = search.toLowerCase();

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#6b7280' }}>Building graph...</div>;
  if (!data?.nodes?.length) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#6b7280', flexDirection: 'column', gap: 16 }}><p style={{ fontSize: 18, color: '#fff' }}>No graph found</p><p>Run <code style={{ color: '#10b981' }}>corpus init</code></p></div>;

  // Build edge lookup for selected node
  const selectedEdges = selected ? data.edges.filter(e => e.source === selected.id || e.target === selected.id) : [];

  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: '1px solid #1f2937', background: '#050505ee', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 13 }}>
          <Link href="/" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#10b981', fontSize: 8 }}>●</span>
            <span style={{ fontWeight: 600, color: '#e5e7eb' }}>corpus</span>
          </Link>
          <span style={{ color: '#374151' }}>|</span>
          <span><strong>{data.stats.totalFiles}</strong> <span style={{ color: '#6b7280' }}>files</span></span>
          <span><strong>{data.stats.totalFunctions}</strong> <span style={{ color: '#6b7280' }}>functions</span></span>
          <span style={{ color: '#10b981' }}><strong>{data.stats.healthScore}</strong>/100</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <input
            type="text" placeholder="Search nodes..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: '#111', border: '1px solid #1f2937', borderRadius: 6, padding: '6px 12px', color: '#e5e7eb', fontSize: 13, width: 200, outline: 'none' }}
          />
          <Link href="/live" style={{ color: '#6b7280', textDecoration: 'none', fontSize: 13 }}>Live</Link>
          <Link href="/demo" style={{ color: '#6b7280', textDecoration: 'none', fontSize: 13 }}>Demo</Link>
        </div>
      </div>

      <div style={{ display: 'flex' }}>
        {/* Main graph area */}
        <div style={{ flex: 1, padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
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
                    background: '#0a0a0a', border: `1px solid ${color}20`, borderRadius: 12,
                    padding: 16, transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={() => setHovered(clusterName)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Cluster header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{clusterName}</span>
                    </div>
                    <span style={{ color: '#6b7280', fontSize: 11 }}>
                      {modules.length} files, {funcs.length} fn
                    </span>
                  </div>

                  {/* Module list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                              padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                              background: isSelected ? color + '15' : isMatch ? '#10b98110' : 'transparent',
                              border: isSelected ? `1px solid ${color}40` : '1px solid transparent',
                              transition: 'all 0.15s',
                            }}
                          >
                            <span style={{
                              fontSize: 12, fontFamily: 'monospace',
                              color: isSelected ? '#fff' : isMatch ? '#10b981' : '#9ca3af',
                            }}>
                              {m.name}
                            </span>
                            <span style={{ fontSize: 10, color: '#4b5563' }}>
                              {fileFuncs.length > 0 ? `${fileFuncs.length} fn` : ''}
                            </span>
                          </div>

                          {/* Expanded: show functions in this module */}
                          {isSelected && fileFuncs.length > 0 && (
                            <div style={{ paddingLeft: 16, marginTop: 2, marginBottom: 4 }}>
                              {fileFuncs.map(f => (
                                <div
                                  key={f.id}
                                  onClick={(e) => { e.stopPropagation(); setSelected(f); }}
                                  style={{
                                    fontSize: 11, fontFamily: 'monospace', color: '#6b7280',
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

            <div style={{ color: '#6b7280', marginBottom: 12, fontFamily: 'monospace', fontSize: 12 }}>
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
                  <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, color: '#a5b4fc', marginBottom: 2 }}>{p}</div>
                ))}
              </Section>
            )}

            {selected.guards?.length > 0 && (
              <Section title="Guard Clauses">
                {selected.guards.map((g, i) => (
                  <div key={i} style={{
                    fontFamily: 'monospace', fontSize: 11, color: '#6ee7b7',
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
                    <div key={i} style={{ fontSize: 11, color: '#6b7280', marginBottom: 2, fontFamily: 'monospace' }}>
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
