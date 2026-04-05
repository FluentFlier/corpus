'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  returnType?: string;
  color: string;
  size: number;
  // simulation
  x: number;
  y: number;
  vx: number;
  vy: number;
  // derived
  cluster: string;
  clusterColor: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  color: string;
}

interface GraphStats {
  totalFiles: number;
  totalFunctions: number;
  totalExports: number;
  healthScore: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLUSTER_PALETTE: Record<string, string> = {
  core: '#3b82f6',
  cli: '#f97316',
  web: '#a855f7',
  mcp: '#06b6d4',
  config: '#eab308',
  tests: '#84cc16',
  scripts: '#ec4899',
  docs: '#64748b',
  packages: '#8b5cf6',
  src: '#6366f1',
  app: '#a855f7',
  api: '#14b8a6',
  components: '#f472b6',
  lib: '#38bdf8',
  utils: '#34d399',
  hooks: '#fb923c',
};

const FALLBACK_COLORS = [
  '#3b82f6', '#f97316', '#a855f7', '#06b6d4', '#eab308',
  '#84cc16', '#ec4899', '#14b8a6', '#f472b6', '#38bdf8',
  '#fb923c', '#34d399', '#818cf8', '#f87171', '#fbbf24',
];

function getCluster(file: string): string {
  const parts = file.replace(/^\.?\//, '').split('/');
  // Try first meaningful directory segment
  for (const part of parts) {
    if (part === 'packages' || part === 'apps') continue;
    if (part.includes('.')) continue; // skip files
    return part;
  }
  return 'root';
}

function getClusterColor(cluster: string, idx: number): string {
  const lower = cluster.toLowerCase();
  if (CLUSTER_PALETTE[lower]) return CLUSTER_PALETTE[lower];
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

function getHealthColor(health: string): string {
  if (health === 'verified') return '#10b981';
  if (health === 'violates') return '#ef4444';
  return '#f59e0b';
}

// ---------------------------------------------------------------------------
// Canvas Graph Component
// ---------------------------------------------------------------------------

function ForceGraph({
  data,
  searchQuery,
}: {
  data: GraphData;
  searchQuery: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const animRef = useRef<number>(0);
  const frameRef = useRef(0);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number; draggedNode: GraphNode | null }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
    draggedNode: null,
  });

  // Edge lookup for highlight
  const edgeIndex = useMemo(() => {
    const idx = new Map<string, { incoming: GraphEdge[]; outgoing: GraphEdge[] }>();
    for (const e of data.edges) {
      if (!idx.has(e.source)) idx.set(e.source, { incoming: [], outgoing: [] });
      if (!idx.has(e.target)) idx.set(e.target, { incoming: [], outgoing: [] });
      idx.get(e.source)!.outgoing.push(e);
      idx.get(e.target)!.incoming.push(e);
    }
    return idx;
  }, [data.edges]);

  // Connections for detail panel
  const getConnections = useCallback(
    (nodeId: string) => {
      const entry = edgeIndex.get(nodeId);
      if (!entry) return { outgoing: [] as GraphEdge[], incoming: [] as GraphEdge[] };
      return entry;
    },
    [edgeIndex],
  );

  // Connected node IDs for highlight
  const getConnectedIds = useCallback(
    (nodeId: string): Set<string> => {
      const s = new Set<string>();
      const entry = edgeIndex.get(nodeId);
      if (!entry) return s;
      for (const e of entry.outgoing) s.add(e.target);
      for (const e of entry.incoming) s.add(e.source);
      return s;
    },
    [edgeIndex],
  );

  // Node map
  const nodeMapRef = useRef(new Map<string, GraphNode>());

  // Initialize positions
  useEffect(() => {
    if (!data.nodes.length) return;

    const clusterSet = new Map<string, number>();
    let clusterIdx = 0;

    const nodes: GraphNode[] = data.nodes.map((n) => {
      const cluster = getCluster(n.file);
      if (!clusterSet.has(cluster)) clusterSet.set(cluster, clusterIdx++);
      const ci = clusterSet.get(cluster)!;
      const clusterColor = getClusterColor(cluster, ci);

      const totalClusters = Math.max(clusterSet.size, 1);
      const angle = (ci / Math.max(totalClusters, 8)) * Math.PI * 2;
      const radius = 250 + (ci % 4) * 80;
      const jitter = Math.random() * 50 - 25;

      return {
        ...n,
        cluster,
        clusterColor,
        x: Math.cos(angle) * radius + jitter,
        y: Math.sin(angle) * radius + jitter,
        vx: 0,
        vy: 0,
      };
    });

    nodesRef.current = nodes;
    const nm = new Map<string, GraphNode>();
    nodes.forEach((n) => nm.set(n.id, n));
    nodeMapRef.current = nm;

    // Center camera
    cameraRef.current = { x: 0, y: 0, zoom: 1 };
    frameRef.current = 0;
  }, [data.nodes]);

  // Screen to world coords
  const screenToWorld = useCallback((sx: number, sy: number, canvas: HTMLCanvasElement) => {
    const cam = cameraRef.current;
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    return {
      x: (sx - cx) / cam.zoom + cam.x,
      y: (sy - cy) / cam.zoom + cam.y,
    };
  }, []);

  // Find node at position
  const findNodeAt = useCallback((wx: number, wy: number): GraphNode | null => {
    const nodes = nodesRef.current;
    const cam = cameraRef.current;
    // Search in reverse to pick top-drawn nodes first
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - wx;
      const dy = n.y - wy;
      const hitRadius = (n.size + 4) / cam.zoom;
      if (dx * dx + dy * dy < hitRadius * hitRadius * cam.zoom * cam.zoom) return n;
    }
    return null;
  }, []);

  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || !nodesRef.current.length) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodeMap = nodeMapRef.current;
    const maxSimFrames = 600;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function simulate() {
      if (!ctx || !canvas) return;
      const nodes = nodesRef.current;
      const frame = frameRef.current;
      const alpha = Math.max(0.002, 1 - frame / maxSimFrames);
      const cam = cameraRef.current;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;

      // --- Physics ---
      // Cluster cohesion + repulsion
      const clusterCenters = new Map<string, { x: number; y: number; count: number }>();
      for (const n of nodes) {
        const c = clusterCenters.get(n.cluster) || { x: 0, y: 0, count: 0 };
        c.x += n.x;
        c.y += n.y;
        c.count++;
        clusterCenters.set(n.cluster, c);
      }
      clusterCenters.forEach((c) => {
        c.x /= c.count;
        c.y /= c.count;
      });

      // Node repulsion (grid-based spatial hash for performance)
      const cellSize = 80;
      const grid = new Map<string, GraphNode[]>();
      for (const n of nodes) {
        const gx = Math.floor(n.x / cellSize);
        const gy = Math.floor(n.y / cellSize);
        const key = `${gx},${gy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(n);
      }

      for (const n of nodes) {
        const gx = Math.floor(n.x / cellSize);
        const gy = Math.floor(n.y / cellSize);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const cell = grid.get(`${gx + dx},${gy + dy}`);
            if (!cell) continue;
            for (const m of cell) {
              if (m.id <= n.id) continue;
              const ddx = m.x - n.x;
              const ddy = m.y - n.y;
              const distSq = ddx * ddx + ddy * ddy;
              if (distSq > 25600) continue; // ~160px
              const dist = Math.sqrt(distSq) || 0.1;
              const sameCluster = n.cluster === m.cluster;
              const repulsion = sameCluster ? 8 : 20;
              const force = (repulsion * alpha) / (dist * 0.4);
              const fx = (ddx / dist) * force;
              const fy = (ddy / dist) * force;
              n.vx -= fx;
              n.vy -= fy;
              m.vx += fx;
              m.vy += fy;
            }
          }
        }

        // Cluster attraction: pull toward cluster center
        const cc = clusterCenters.get(n.cluster);
        if (cc) {
          n.vx += (cc.x - n.x) * 0.003 * alpha;
          n.vy += (cc.y - n.y) * 0.003 * alpha;
        }

        // Global center gravity (weak)
        n.vx -= n.x * 0.001 * alpha;
        n.vy -= n.y * 0.001 * alpha;
      }

      // Edge attraction
      for (const edge of data.edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;
        const ddx = target.x - source.x;
        const ddy = target.y - source.y;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 0.1;
        const idealDist = edge.type === 'exports' ? 25 : 60;
        const strength = source.cluster === target.cluster ? 0.04 : 0.015;
        const force = (dist - idealDist) * strength * alpha;
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      }

      // Velocity damping and position update
      for (const n of nodes) {
        // If being dragged, skip physics
        if (dragRef.current.draggedNode?.id === n.id) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
      }

      // --- Rendering ---
      ctx.clearRect(0, 0, W, H);

      // Background grid
      ctx.save();
      const gridSpacing = 40 * cam.zoom;
      const offsetX = (W / 2 - cam.x * cam.zoom) % gridSpacing;
      const offsetY = (H / 2 - cam.y * cam.zoom) % gridSpacing;
      ctx.strokeStyle = '#ffffff06';
      ctx.lineWidth = 1;
      for (let x = offsetX; x < W; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = offsetY; y < H; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.restore();

      // Camera transform
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      const activeId = hoveredNode?.id || selected?.id || null;
      const connectedIds = activeId ? getConnectedIds(activeId) : new Set<string>();
      const isSearching = searchQuery.length > 1;
      const searchLower = searchQuery.toLowerCase();

      // --- Draw edges ---
      for (const edge of data.edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        const isHighlighted =
          activeId && (edge.source === activeId || edge.target === activeId);

        let opacity = 0.12;
        if (isHighlighted) opacity = 0.7;
        else if (activeId) opacity = 0.04;
        if (isSearching) {
          const srcMatch = source.name.toLowerCase().includes(searchLower) || source.file.toLowerCase().includes(searchLower);
          const tgtMatch = target.name.toLowerCase().includes(searchLower) || target.file.toLowerCase().includes(searchLower);
          opacity = srcMatch || tgtMatch ? 0.5 : 0.03;
        }

        ctx.beginPath();
        ctx.strokeStyle = edge.color;
        ctx.globalAlpha = opacity;
        ctx.lineWidth = isHighlighted ? 2 : 0.8;

        // Dash pattern by type
        if (edge.type === 'imports') {
          ctx.setLineDash([6, 4]);
        } else if (edge.type === 'exports') {
          ctx.setLineDash([2, 3]);
        } else {
          ctx.setLineDash([]);
        }

        // Curved edges
        const mx = (source.x + target.x) / 2;
        const my = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // perpendicular offset for curve
        const curveOffset = Math.min(dist * 0.15, 30);
        const cpx = mx + (-dy / dist) * curveOffset;
        const cpy = my + (dx / dist) * curveOffset;

        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(cpx, cpy, target.x, target.y);
        ctx.stroke();

        // Arrow head
        if (isHighlighted || opacity > 0.1) {
          const t = 0.85;
          const ax = (1 - t) * (1 - t) * source.x + 2 * (1 - t) * t * cpx + t * t * target.x;
          const ay = (1 - t) * (1 - t) * source.y + 2 * (1 - t) * t * cpy + t * t * target.y;
          const adx = target.x - cpx;
          const ady = target.y - cpy;
          const angle = Math.atan2(ady, adx);
          const arrowLen = isHighlighted ? 8 : 5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4));
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4));
          ctx.stroke();
        }

        ctx.setLineDash([]);
      }

      ctx.globalAlpha = 1;

      // --- Draw nodes ---
      const time = frame * 0.04;
      for (const node of nodes) {
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selected?.id === node.id;
        const isConnected = connectedIds.has(node.id);
        const isActive = isHovered || isSelected;

        let nodeOpacity = 1;
        if (activeId && !isActive && !isConnected && node.id !== activeId) {
          nodeOpacity = 0.2;
        }
        if (isSearching) {
          const matches = node.name.toLowerCase().includes(searchLower) || node.file.toLowerCase().includes(searchLower);
          nodeOpacity = matches ? 1 : 0.08;
        }

        const baseRadius = node.type === 'module' ? 14 : node.type === 'class' ? 11 : node.exported ? 7 : 4.5;
        const radius = baseRadius * (isActive ? 1.4 : isConnected ? 1.15 : 1);

        ctx.globalAlpha = nodeOpacity;

        // Outer glow halo (health color)
        const healthColor = getHealthColor(node.health);
        const glowRadius = radius + (isActive ? 14 : 6);
        const glow = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, glowRadius);
        glow.addColorStop(0, healthColor + (isActive ? '50' : '20'));
        glow.addColorStop(1, healthColor + '00');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Connected nodes pulse
        if (isConnected && activeId) {
          const pulse = Math.sin(time * 3) * 0.3 + 0.7;
          const pulseGlow = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, radius + 10);
          pulseGlow.addColorStop(0, node.clusterColor + Math.round(pulse * 80).toString(16).padStart(2, '0'));
          pulseGlow.addColorStop(1, node.clusterColor + '00');
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 10, 0, Math.PI * 2);
          ctx.fillStyle = pulseGlow;
          ctx.fill();
        }

        // Node body - cluster color with health tint
        const bodyGrad = ctx.createRadialGradient(
          node.x - radius * 0.3, node.y - radius * 0.3, 0,
          node.x, node.y, radius,
        );
        bodyGrad.addColorStop(0, node.clusterColor + 'ee');
        bodyGrad.addColorStop(1, node.clusterColor + '99');
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Health ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = healthColor;
        ctx.lineWidth = isActive ? 2.5 : 1.5;
        ctx.stroke();

        // Selected ring
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Labels
        if (isActive || isConnected || node.type === 'module' || (cam.zoom > 1.5 && node.exported)) {
          const fontSize = isActive ? 12 : isConnected ? 10 : 9;
          ctx.font = `${isActive ? '600' : '400'} ${fontSize}px 'JetBrains Mono', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // text shadow
          ctx.fillStyle = '#000000cc';
          ctx.fillText(node.name, node.x + 1, node.y + radius + 5);
          ctx.fillStyle = isActive ? '#ffffff' : '#ffffffbb';
          ctx.fillText(node.name, node.x, node.y + radius + 4);

          if (isActive) {
            ctx.font = '400 9px system-ui, sans-serif';
            ctx.fillStyle = '#ffffff88';
            ctx.fillText(node.type, node.x, node.y + radius + 18);
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();

      frameRef.current++;
      animRef.current = requestAnimationFrame(simulate);
    }

    simulate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selected, hoveredNode, searchQuery]);

  // --- Mouse handlers ---
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    cam.zoom = Math.max(0.15, Math.min(6, cam.zoom * factor));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const w = screenToWorld(sx, sy, canvas);
      const node = findNodeAt(w.x, w.y);

      dragRef.current = {
        dragging: true,
        lastX: e.clientX,
        lastY: e.clientY,
        draggedNode: node,
      };
    },
    [screenToWorld, findNodeAt],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const w = screenToWorld(sx, sy, canvas);

      if (dragRef.current.dragging) {
        const cam = cameraRef.current;
        if (dragRef.current.draggedNode) {
          // Drag node
          const node = dragRef.current.draggedNode;
          const dx = (e.clientX - dragRef.current.lastX) / cam.zoom;
          const dy = (e.clientY - dragRef.current.lastY) / cam.zoom;
          node.x += dx;
          node.y += dy;
          node.vx = 0;
          node.vy = 0;
        } else {
          // Pan camera
          const dx = (e.clientX - dragRef.current.lastX) / cam.zoom;
          const dy = (e.clientY - dragRef.current.lastY) / cam.zoom;
          cam.x -= dx;
          cam.y -= dy;
        }
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
        return;
      }

      const hovered = findNodeAt(w.x, w.y);
      setHoveredNode(hovered || null);
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
    },
    [screenToWorld, findNodeAt],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const wasDragging = dragRef.current.dragging;
      const wasDraggingNode = dragRef.current.draggedNode;
      const movedDist = Math.abs(e.clientX - dragRef.current.lastX) + Math.abs(e.clientY - dragRef.current.lastY);
      dragRef.current = { dragging: false, lastX: 0, lastY: 0, draggedNode: null };

      // If it was a click (not a drag), select/deselect
      if (!wasDraggingNode || movedDist < 3) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const w = screenToWorld(sx, sy, canvas);
        const node = findNodeAt(w.x, w.y);
        setSelected(node || null);
      }
    },
    [screenToWorld, findNodeAt],
  );

  const handleDblClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const w = screenToWorld(sx, sy, canvas);
      const node = findNodeAt(w.x, w.y);

      if (node) {
        // Zoom into this node
        const cam = cameraRef.current;
        cam.x = node.x;
        cam.y = node.y;
        cam.zoom = Math.min(cam.zoom * 2, 5);
      }
    },
    [screenToWorld, findNodeAt],
  );

  // Zoom controls
  const zoomIn = useCallback(() => {
    cameraRef.current.zoom = Math.min(6, cameraRef.current.zoom * 1.3);
  }, []);
  const zoomOut = useCallback(() => {
    cameraRef.current.zoom = Math.max(0.15, cameraRef.current.zoom / 1.3);
  }, []);
  const zoomFit = useCallback(() => {
    cameraRef.current = { x: 0, y: 0, zoom: 1 };
  }, []);

  // Build cluster legend
  const clusters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of data.nodes) {
      const cluster = getCluster(n.file);
      if (!seen.has(cluster)) {
        // find the clusterColor from the first node with this cluster
        const existing = nodesRef.current.find((nn) => nn.cluster === cluster);
        seen.set(cluster, existing?.clusterColor || '#888');
      }
    }
    return Array.from(seen.entries());
  }, [data.nodes]);

  // Connection info for detail panel
  const connections = useMemo(() => {
    if (!selected) return { outgoing: [], incoming: [] };
    return getConnections(selected.id);
  }, [selected, getConnections]);

  return (
    <>
      {/* Full-screen canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          dragRef.current = { dragging: false, lastX: 0, lastY: 0, draggedNode: null };
          setHoveredNode(null);
        }}
        onDoubleClick={handleDblClick}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          background: '#08090d',
          cursor: 'grab',
        }}
      />

      {/* Zoom Controls */}
      <div
        style={{
          position: 'fixed',
          bottom: 80,
          left: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 30,
        }}
      >
        {[
          { label: '+', action: zoomIn },
          { label: '-', action: zoomOut },
          { label: '[]', action: zoomFit },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={btn.action}
            style={{
              width: 36,
              height: 36,
              background: 'rgba(15, 17, 25, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid #ffffff15',
              borderRadius: 8,
              color: '#9ca3af',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(30, 34, 50, 0.95)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 17, 25, 0.85)';
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Hover tooltip */}
      {hoveredNode && !selected && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 80,
            transform: 'translateX(-50%)',
            background: 'rgba(10, 12, 20, 0.9)',
            backdropFilter: 'blur(16px)',
            border: '1px solid #ffffff15',
            borderRadius: 10,
            padding: '8px 16px',
            color: '#e5e7eb',
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            zIndex: 40,
            pointerEvents: 'none',
            display: 'flex',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <span style={{ color: hoveredNode.clusterColor, fontWeight: 600 }}>
            {hoveredNode.name}
          </span>
          <span style={{ color: '#6b7280' }}>{hoveredNode.type}</span>
          <span style={{ color: getHealthColor(hoveredNode.health), fontSize: 11 }}>
            {hoveredNode.health.toUpperCase()}
          </span>
          <span style={{ color: '#6b7280', fontSize: 11 }}>{hoveredNode.file}</span>
        </div>
      )}

      {/* Detail Panel (right side slide-in) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: selected ? 0 : -400,
          width: 380,
          height: '100vh',
          background: 'rgba(8, 10, 18, 0.92)',
          backdropFilter: 'blur(24px)',
          borderLeft: '1px solid #ffffff10',
          zIndex: 50,
          transition: 'right 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowY: 'auto',
          padding: '28px 24px',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {selected && (
          <>
            {/* Close button */}
            <button
              onClick={() => setSelected(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                width: 32,
                height: 32,
                background: '#ffffff08',
                border: '1px solid #ffffff10',
                borderRadius: 8,
                color: '#6b7280',
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              x
            </button>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#fff',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {selected.name}
                </span>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    background: getHealthColor(selected.health) + '18',
                    color: getHealthColor(selected.health),
                    border: `1px solid ${getHealthColor(selected.health)}30`,
                  }}
                >
                  {selected.health.toUpperCase()}
                </span>
              </div>
              <div style={{ color: '#6b7280', fontSize: 12 }}>
                {selected.file}:{selected.line || ''}
              </div>
            </div>

            {/* Metadata */}
            <div style={{ marginBottom: 20 }}>
              <div style={sectionLabelStyle}>Type</div>
              <div style={{ color: '#d1d5db', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: selected.clusterColor,
                    display: 'inline-block',
                  }}
                />
                {selected.type}
                {selected.exported && (
                  <span style={{ color: '#6366f1', fontSize: 10, fontWeight: 600 }}>EXPORTED</span>
                )}
              </div>
            </div>

            {/* Parameters */}
            {selected.params?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={sectionLabelStyle}>Parameters</div>
                {selected.params.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      color: '#a5b4fc',
                      fontSize: 12,
                      padding: '3px 0',
                      borderBottom: i < selected.params.length - 1 ? '1px solid #ffffff06' : 'none',
                    }}
                  >
                    {p}
                  </div>
                ))}
              </div>
            )}

            {/* Return Type */}
            {selected.returnType && (
              <div style={{ marginBottom: 20 }}>
                <div style={sectionLabelStyle}>Return Type</div>
                <div style={{ color: '#67e8f9', fontSize: 12 }}>{selected.returnType}</div>
              </div>
            )}

            {/* Guard Clauses */}
            {selected.guards?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={sectionLabelStyle}>Guard Clauses</div>
                {selected.guards.map((g, i) => (
                  <div
                    key={i}
                    style={{
                      color: '#6ee7b7',
                      fontSize: 11,
                      padding: '4px 8px',
                      background: '#10b98108',
                      borderRadius: 4,
                      marginBottom: 4,
                      borderLeft: '2px solid #10b98140',
                    }}
                  >
                    {g}
                  </div>
                ))}
              </div>
            )}

            {/* Trust Score Ring */}
            <div style={{ marginBottom: 24 }}>
              <div style={sectionLabelStyle}>Trust Score</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
                <svg width="56" height="56" viewBox="0 0 56 56">
                  {/* Background ring */}
                  <circle cx="28" cy="28" r="22" fill="none" stroke="#ffffff08" strokeWidth="5" />
                  {/* Score arc */}
                  <circle
                    cx="28"
                    cy="28"
                    r="22"
                    fill="none"
                    stroke={getHealthColor(selected.health)}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${(selected.trustScore / 100) * 138.2} 138.2`}
                    transform="rotate(-90 28 28)"
                    style={{ transition: 'stroke-dasharray 0.6s ease' }}
                  />
                  <text
                    x="28"
                    y="28"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#fff"
                    fontSize="14"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {selected.trustScore}
                  </text>
                </svg>
                <div style={{ color: '#9ca3af', fontSize: 12 }}>
                  <div>out of 100</div>
                  <div style={{ color: getHealthColor(selected.health), fontWeight: 600, marginTop: 2 }}>
                    {selected.trustScore >= 80 ? 'Excellent' : selected.trustScore >= 50 ? 'Fair' : 'At Risk'}
                  </div>
                </div>
              </div>
            </div>

            {/* Connections */}
            <div style={{ marginBottom: 24 }}>
              <div style={sectionLabelStyle}>
                Connections ({connections.outgoing.length + connections.incoming.length})
              </div>
              {connections.outgoing.slice(0, 8).map((e, i) => {
                const target = nodeMapRef.current.get(e.target);
                return (
                  <div
                    key={`o-${i}`}
                    style={{
                      color: '#d1d5db',
                      fontSize: 12,
                      padding: '4px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ color: '#6366f1' }}>-&gt;</span>
                    <span style={{ color: '#a5b4fc' }}>{e.type}</span>
                    <span>{target?.name || e.target.split(':').pop()}</span>
                  </div>
                );
              })}
              {connections.incoming.slice(0, 8).map((e, i) => {
                const source = nodeMapRef.current.get(e.source);
                return (
                  <div
                    key={`i-${i}`}
                    style={{
                      color: '#d1d5db',
                      fontSize: 12,
                      padding: '4px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ color: '#f59e0b' }}>&lt;-</span>
                    <span style={{ color: '#fbbf24' }}>{e.type}</span>
                    <span>{source?.name || e.source.split(':').pop()}</span>
                  </div>
                );
              })}
              {connections.outgoing.length + connections.incoming.length === 0 && (
                <div style={{ color: '#4b5563', fontSize: 12 }}>No connections</div>
              )}
            </div>

            {/* Immune Memory */}
            <div
              style={{
                padding: '12px 14px',
                background: '#ffffff05',
                borderRadius: 8,
                border: '1px solid #ffffff08',
              }}
            >
              <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>Immune Memory</div>
              <div style={{ color: '#d1d5db', fontSize: 12 }}>
                Flagged 0 times &middot; Last verified: just now
              </div>
            </div>
          </>
        )}
      </div>

      {/* Floating bottom legend */}
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 20,
          background: 'rgba(10, 12, 20, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid #ffffff10',
          borderRadius: 12,
          padding: '10px 24px',
          zIndex: 30,
          fontSize: 12,
          color: '#9ca3af',
          fontFamily: "'JetBrains Mono', monospace",
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '90vw',
        }}
      >
        {/* Health legend */}
        <LegendItem color="#10b981" label="Verified" type="dot" />
        <LegendItem color="#f59e0b" label="Uncertain" type="dot" />
        <LegendItem color="#ef4444" label="Violates" type="dot" />
        <span style={{ color: '#ffffff15' }}>|</span>
        {/* Edge legend */}
        <LegendItem color="#6366f1" label="Calls" type="solid" />
        <LegendItem color="#8b5cf6" label="Imports" type="dashed" />
        <LegendItem color="#10b981" label="Exports" type="dotted" />
        <span style={{ color: '#ffffff15' }}>|</span>
        {/* Cluster legend (first 6) */}
        {clusters.slice(0, 6).map(([name, color]) => (
          <LegendItem key={name} color={color} label={name} type="dot" />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Legend Item
// ---------------------------------------------------------------------------

function LegendItem({ color, label, type }: { color: string; label: string; type: 'dot' | 'solid' | 'dashed' | 'dotted' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {type === 'dot' && (
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      )}
      {type === 'solid' && (
        <div style={{ width: 18, height: 2, background: color, borderRadius: 1 }} />
      )}
      {type === 'dashed' && (
        <div style={{ width: 18, height: 0, borderTop: `2px dashed ${color}` }} />
      )}
      {type === 'dotted' && (
        <div style={{ width: 18, height: 0, borderTop: `2px dotted ${color}` }} />
      )}
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section label style
// ---------------------------------------------------------------------------

const sectionLabelStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

// ---------------------------------------------------------------------------
// Immune Pulse SVG
// ---------------------------------------------------------------------------

function ImmunePulse({ score }: { score: number }) {
  const healthColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  // Faster pulse when health is lower
  const duration = score >= 80 ? '3s' : score >= 50 ? '1.8s' : '0.9s';

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ overflow: 'visible' }}>
      {/* Outer pulse ring */}
      <circle cx="22" cy="22" r="18" fill="none" stroke={healthColor} strokeWidth="1.5" opacity="0.3">
        <animate attributeName="r" values="16;22;16" dur={duration} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur={duration} repeatCount="indefinite" />
      </circle>
      <circle cx="22" cy="22" r="14" fill="none" stroke={healthColor} strokeWidth="1">
        <animate attributeName="r" values="14;18;14" dur={duration} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.05;0.3" dur={duration} repeatCount="indefinite" />
      </circle>
      {/* Core */}
      <circle cx="22" cy="22" r="12" fill={healthColor + '25'} stroke={healthColor} strokeWidth="2">
        <animate attributeName="r" values="11;13;11" dur={duration} repeatCount="indefinite" />
      </circle>
      {/* Score text */}
      <text
        x="22"
        y="22"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize="11"
        fontWeight="800"
        fontFamily="JetBrains Mono, monospace"
      >
        {score}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetch('/api/graph')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#08090d',
        color: '#fff',
        fontFamily: "system-ui, -apple-system, 'JetBrains Mono', monospace",
        overflow: 'hidden',
      }}
    >
      {/* Loading state */}
      {loading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#08090d',
            zIndex: 100,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <svg width="60" height="60" viewBox="0 0 60 60" style={{ marginBottom: 20 }}>
              <circle cx="30" cy="30" r="24" fill="none" stroke="#10b98130" strokeWidth="3" />
              <circle cx="30" cy="30" r="24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 120">
                <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite" />
              </circle>
            </svg>
            <div style={{ color: '#6b7280', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>
              Building graph...
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#08090d',
            zIndex: 100,
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: '#ef444415',
                border: '1px solid #ef444430',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                fontSize: 28,
              }}
            >
              !
            </div>
            <div style={{ color: '#ef4444', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              No graph found
            </div>
            <div style={{ color: '#6b7280', fontSize: 14 }}>
              Run{' '}
              <code
                style={{
                  color: '#10b981',
                  background: '#10b98115',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                corpus init
              </code>{' '}
              to build the immune system
            </div>
            <a
              href="/"
              style={{
                display: 'inline-block',
                marginTop: 24,
                padding: '10px 24px',
                background: '#ffffff08',
                border: '1px solid #ffffff15',
                borderRadius: 8,
                color: '#9ca3af',
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              Back to Home
            </a>
          </div>
        </div>
      )}

      {/* Graph */}
      {data && !loading && <ForceGraph data={data} searchQuery={searchQuery} />}

      {/* Floating stats bar */}
      {data && !loading && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            background: 'rgba(10, 12, 20, 0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid #ffffff10',
            borderRadius: 14,
            padding: '10px 28px',
            zIndex: 40,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {/* Home link */}
          <a
            href="/"
            style={{
              color: '#6b7280',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              transition: 'color 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 2L4 8l6 6" />
            </svg>
            corpus
          </a>

          <div style={{ width: 1, height: 24, background: '#ffffff10' }} />

          {/* Stats */}
          <StatPill label="Files" value={data.stats.totalFiles} />
          <StatPill label="Functions" value={data.stats.totalFunctions} />

          <div style={{ width: 1, height: 24, background: '#ffffff10' }} />

          {/* Health pulse */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ImmunePulse score={data.stats.healthScore} />
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: '0.05em' }}>HEALTH</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color:
                    data.stats.healthScore >= 80
                      ? '#10b981'
                      : data.stats.healthScore >= 50
                        ? '#f59e0b'
                        : '#ef4444',
                }}
              >
                {data.stats.healthScore}/100
              </div>
            </div>
          </div>

          <div style={{ width: 1, height: 24, background: '#ffffff10' }} />

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="#6b7280"
              strokeWidth="2"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
            >
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3 3" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
              style={{
                width: 180,
                padding: '7px 12px 7px 32px',
                background: '#ffffff08',
                border: '1px solid #ffffff10',
                borderRadius: 8,
                color: '#e5e7eb',
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
                transition: 'border-color 0.2s, background 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#ffffff25';
                e.currentTarget.style.background = '#ffffff10';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#ffffff10';
                e.currentTarget.style.background = '#ffffff08';
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Pill
// ---------------------------------------------------------------------------

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}
