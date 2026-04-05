'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface GraphNode {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  health: string;
  trustScore: number;
  exported: boolean;
  guards: string[];
  params: string[];
  color: string;
  size: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  color: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalFiles: number;
    totalFunctions: number;
    totalExports: number;
    healthScore: number;
  };
}

function ForceGraph({ data }: { data: GraphData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const animRef = useRef<number>(0);

  // Initialize node positions in a tighter cluster
  useEffect(() => {
    if (!data.nodes.length) return;

    // Group nodes by file for spatial clustering
    const fileGroups = new Map<string, number>();
    data.nodes.forEach(n => {
      if (!fileGroups.has(n.file)) fileGroups.set(n.file, fileGroups.size);
    });
    const totalGroups = fileGroups.size || 1;

    const nodes = data.nodes.map((n, i) => {
      const groupIdx = fileGroups.get(n.file) || 0;
      const groupAngle = (groupIdx / totalGroups) * Math.PI * 2;
      const groupRadius = 120 + (groupIdx % 3) * 40;
      const jitter = Math.random() * 30 - 15;
      return {
        ...n,
        x: 400 + Math.cos(groupAngle) * groupRadius + jitter,
        y: 300 + Math.sin(groupAngle) * groupRadius + jitter,
        vx: 0,
        vy: 0,
      };
    });
    nodesRef.current = nodes;
  }, [data.nodes]);

  // Force simulation
  useEffect(() => {
    if (!canvasRef.current || !nodesRef.current.length) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodeMap = new Map<string, GraphNode>();
    nodesRef.current.forEach(n => nodeMap.set(n.id, n));

    let frame = 0;
    const maxFrames = 500;

    // Scale canvas for retina
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = 800 * dpr;
    canvas.height = 600 * dpr;
    ctx.scale(dpr, dpr);

    function simulate() {
      if (!ctx) return;
      const nodes = nodesRef.current;
      const alpha = Math.max(0.001, 1 - frame / maxFrames);

      // Repulsion: use Barnes-Hut-style approximation for speed
      // Only compute between nearby nodes (skip distant ones)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x! - nodes[i].x!;
          const dy = nodes[j].y! - nodes[i].y!;
          const distSq = dx * dx + dy * dy;
          if (distSq > 40000) continue; // Skip nodes >200px apart
          const dist = Math.sqrt(distSq) || 1;
          const force = (15 * alpha) / (dist * 0.5);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx! -= fx;
          nodes[i].vy! -= fy;
          nodes[j].vx! += fx;
          nodes[j].vy! += fy;
        }
      }

      // Attraction along edges (much stronger)
      for (const edge of data.edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;
        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const idealDist = edge.type === 'exports' ? 20 : 50;
        const force = (dist - idealDist) * 0.03 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        source.vx! += fx;
        source.vy! += fy;
        target.vx! -= fx;
        target.vy! -= fy;
      }

      // Strong center gravity to keep everything visible
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (const node of nodes) {
        node.vx! += (cx - node.x!) * 0.008 * alpha;
        node.vy! += (cy - node.y!) * 0.008 * alpha;
        node.vx! *= 0.85;
        node.vy! *= 0.85;
        node.x! += node.vx!;
        node.y! += node.vy!;
        // Clamp to canvas bounds
        node.x! = Math.max(20, Math.min(canvas.width - 20, node.x!));
        node.y! = Math.max(20, Math.min(canvas.height - 20, node.y!));
      }

      // Draw
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw edges
      for (const edge of data.edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;
        ctx.beginPath();
        ctx.moveTo(source.x!, source.y!);
        ctx.lineTo(target.x!, target.y!);
        ctx.strokeStyle = edge.color + '40';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selected?.id === node.id;
        const radius = node.size * (isHovered ? 1.5 : 1);

        // Glow effect
        if (node.health === 'violates') {
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, radius + 6, 0, Math.PI * 2);
          const gradient = ctx.createRadialGradient(
            node.x!, node.y!, radius,
            node.x!, node.y!, radius + 6
          );
          gradient.addColorStop(0, '#ef444440');
          gradient.addColorStop(1, '#ef444400');
          ctx.fillStyle = gradient;
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Label: only on hover or for module nodes
        if (isHovered || isSelected || (node.type === 'module' && node.size >= 10)) {
          ctx.fillStyle = isHovered ? '#fff' : '#ffffffaa';
          ctx.font = `${isHovered ? 11 : 9}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(node.name, node.x!, node.y! + radius + 12);
        }
      }

      // Pulse animation for health score
      const pulseRadius = 20 + Math.sin(frame * 0.05) * 3;
      const healthColor = data.stats.healthScore >= 80 ? '#10b981'
                        : data.stats.healthScore >= 50 ? '#f59e0b'
                        : '#ef4444';
      ctx.beginPath();
      ctx.arc(50, 50, pulseRadius, 0, Math.PI * 2);
      ctx.fillStyle = healthColor + '30';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(50, 50, 15, 0, Math.PI * 2);
      ctx.fillStyle = healthColor;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(data.stats.healthScore), 50, 54);

      frame++;
      if (frame < maxFrames + 200) {
        animRef.current = requestAnimationFrame(simulate);
      }
    }

    simulate();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [data, selected, hoveredNode]);

  // Mouse interaction
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clicked = nodesRef.current.find(n => {
      const dx = n.x! - x;
      const dy = n.y! - y;
      return Math.sqrt(dx * dx + dy * dy) < n.size * 1.5;
    });
    setSelected(clicked || null);
  }, []);

  const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hovered = nodesRef.current.find(n => {
      const dx = n.x! - x;
      const dy = n.y! - y;
      return Math.sqrt(dx * dx + dy * dy) < n.size * 1.5;
    });
    setHoveredNode(hovered || null);
    canvas.style.cursor = hovered ? 'pointer' : 'default';
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMove}
        style={{
          width: '100%',
          height: '600px',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #111827 100%)',
          borderRadius: '16px',
          border: '1px solid #1f2937',
        }}
      />
      {selected && (
        <div style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(17, 24, 39, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #374151',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '300px',
          color: '#e5e7eb',
          fontSize: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>{selected.name}</span>
            <span style={{
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: selected.health === 'verified' ? '#10b98120' : selected.health === 'violates' ? '#ef444420' : '#f59e0b20',
              color: selected.health === 'verified' ? '#10b981' : selected.health === 'violates' ? '#ef4444' : '#f59e0b',
            }}>
              {selected.health.toUpperCase()}
            </span>
          </div>
          <div style={{ color: '#9ca3af', marginBottom: 8 }}>{selected.file}:{selected.line || ''}</div>
          <div style={{ color: '#9ca3af', marginBottom: 8 }}>Type: {selected.type} {selected.exported ? '(exported)' : ''}</div>
          {selected.params?.length > 0 && (
            <div style={{ color: '#9ca3af', marginBottom: 8 }}>Params: {selected.params.join(', ')}</div>
          )}
          {selected.guards?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#10b981', fontWeight: 600, marginBottom: 4 }}>Guard Clauses:</div>
              {selected.guards.map((g, i) => (
                <div key={i} style={{ color: '#6ee7b7', fontSize: 12, fontFamily: 'monospace', marginBottom: 2 }}>{g}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8,
              background: `conic-gradient(${selected.color} ${selected.trustScore}%, #1f2937 0)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 6,
                background: '#111827',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 12, color: '#fff',
              }}>
                {selected.trustScore}
              </div>
            </div>
            <span style={{ color: '#9ca3af' }}>Trust Score</span>
          </div>
          <button
            onClick={() => setSelected(null)}
            style={{
              marginTop: 12, width: '100%', padding: '8px',
              background: '#1f2937', border: '1px solid #374151',
              borderRadius: 8, color: '#9ca3af', cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/graph')
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      color: '#fff',
      padding: '32px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{
              fontSize: 28,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #10b981, #6366f1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: 4,
            }}>
              Corpus Graph
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              Your codebase immune system. Green = healthy. Red = broken. Yellow = changed.
            </p>
          </div>

          {data && (
            <div style={{ display: 'flex', gap: 24 }}>
              <Stat label="Files" value={data.stats.totalFiles} />
              <Stat label="Functions" value={data.stats.totalFunctions} />
              <Stat label="Health" value={data.stats.healthScore} suffix="/100" color={
                data.stats.healthScore >= 80 ? '#10b981' : data.stats.healthScore >= 50 ? '#f59e0b' : '#ef4444'
              } />
            </div>
          )}
        </div>

        {/* Graph */}
        {loading && (
          <div style={{
            height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#111827', borderRadius: 16, border: '1px solid #1f2937',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 40, height: 40, border: '3px solid #10b98140',
                borderTopColor: '#10b981', borderRadius: '50%',
                animation: 'spin 1s linear infinite', margin: '0 auto 16px',
              }} />
              <p style={{ color: '#6b7280' }}>Building graph...</p>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#111827', borderRadius: 16, border: '1px solid #ef444440',
          }}>
            <div style={{ textAlign: 'center', color: '#ef4444' }}>
              <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No graph found</p>
              <p style={{ color: '#6b7280' }}>Run <code style={{ color: '#10b981' }}>corpus init</code> to build the immune system</p>
            </div>
          </div>
        )}

        {data && !loading && <ForceGraph data={data} />}

        {/* Legend */}
        <div style={{
          marginTop: 24,
          display: 'flex',
          gap: 32,
          justifyContent: 'center',
          color: '#6b7280',
          fontSize: 13,
        }}>
          <Legend color="#10b981" label="Verified" />
          <Legend color="#f59e0b" label="Uncertain" />
          <Legend color="#ef4444" label="Violates" />
          <Legend color="#6366f1" label="Calls" dashed />
          <Legend color="#8b5cf6" label="Imports" dashed />
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function Stat({ label, value, suffix, color }: { label: string; value: number; suffix?: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || '#fff' }}>
        {value}{suffix}
      </div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {dashed ? (
        <div style={{ width: 20, height: 2, background: color, opacity: 0.6 }} />
      ) : (
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      )}
      <span>{label}</span>
    </div>
  );
}
