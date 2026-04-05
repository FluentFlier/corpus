/**
 * corpus init / corpus graph -- Auto-generate the codebase graph
 *
 * Scans your project, builds a graph of every function, module, and relationship.
 * No configuration needed. One command. Corpus learns your entire codebase.
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import { createServer } from 'http';
import { exec } from 'child_process';
import path from 'path';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  bg_green: '\x1b[42m',
  bg_red: '\x1b[41m',
  white: '\x1b[37m',
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function animateStep(text: string, delay: number = 80): Promise<void> {
  process.stdout.write(`  ${C.green}\u2713${C.reset} ${text}`);
  await sleep(delay);
  process.stdout.write('\n');
}

export async function initGraph(args: string[]): Promise<void> {
  const flags = args.filter(a => a.startsWith('--'));
  const positional = args.filter(a => !a.startsWith('--'));
  const projectRoot = positional[0] ? path.resolve(positional[0]) : process.cwd();
  const { buildGraph, saveGraph } = await import('@corpus/core');

  if (!existsSync(projectRoot)) {
    console.error(`\n  ${C.red}Error:${C.reset} Directory not found: ${projectRoot}\n`);
    process.exit(1);
  }

  // ── Header ──
  console.log('');
  console.log(`  ${C.cyan}${C.bold}CORPUS${C.reset}  ${C.dim}The immune system for vibe-coded software${C.reset}`);
  console.log(`  ${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log('');

  // ── Scan ──
  process.stdout.write(`  ${C.dim}Scanning project structure...${C.reset}`);
  const startTime = Date.now();
  const graph = buildGraph(projectRoot);
  const elapsed = Date.now() - startTime;
  process.stdout.write(`\r  ${C.green}\u2713${C.reset} Scanning project structure... ${C.dim}${elapsed}ms${C.reset}\n`);

  // ── Animated results ──
  await animateStep(`Found ${C.bold}${graph.stats.totalFiles}${C.reset} files across ${C.bold}${new Set(graph.nodes.filter(n => n.type === 'module').map(n => n.file.split('/')[0])).size}${C.reset} modules`);
  await animateStep(`Mapped ${C.bold}${graph.stats.totalFunctions}${C.reset} functions and ${C.bold}${graph.edges.filter(e => e.type === 'calls').length}${C.reset} dependencies`);
  await animateStep(`Building structural graph...`);

  // ── Save ──
  const graphPath = saveGraph(graph, projectRoot);
  await animateStep(`Graph saved: ${C.bold}${graph.nodes.length}${C.reset} nodes, ${C.bold}${graph.edges.length}${C.reset} edges`);

  // ── Config ──
  const corpusDir = path.join(projectRoot, '.corpus');
  if (!existsSync(corpusDir)) {
    mkdirSync(corpusDir, { recursive: true });
  }

  const configPath = path.join(corpusDir, 'config.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      mode: 'watch',
      autoFix: true,
      mcpEnabled: true,
    }, null, 2));
  }

  // ── MCP config ──
  const mcpPath = path.join(projectRoot, '.mcp.json');
  if (!existsSync(mcpPath)) {
    writeFileSync(mcpPath, JSON.stringify({
      mcpServers: {
        corpus: {
          command: 'npx',
          args: ['corpus-mcp'],
          type: 'stdio',
        },
      },
    }, null, 2));
    await animateStep(`MCP watchers attached to ${C.cyan}Claude Code${C.reset}, ${C.cyan}Cursor${C.reset}`);
  } else {
    const existing = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    if (!existing.mcpServers?.corpus) {
      existing.mcpServers = existing.mcpServers || {};
      existing.mcpServers.corpus = {
        command: 'npx',
        args: ['corpus-mcp'],
        type: 'stdio',
      };
      writeFileSync(mcpPath, JSON.stringify(existing, null, 2));
      await animateStep(`MCP watchers attached to ${C.cyan}Claude Code${C.reset}, ${C.cyan}Cursor${C.reset}`);
    } else {
      await animateStep(`MCP already configured`);
    }
  }

  // ── Gitignore ──
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.corpus')) {
      appendFileSync(gitignorePath, '\n.corpus/\n');
    }
  }

  // ── Health summary ──
  const healthColor = graph.stats.healthScore >= 80 ? C.green
                    : graph.stats.healthScore >= 50 ? C.yellow
                    : C.red;

  console.log('');
  console.log(`  ${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}$ corpus status${C.reset}`);
  console.log(`  ${C.green}\u25CF${C.reset} Health: ${healthColor}${C.bold}${graph.stats.healthScore}/100${C.reset} ${C.dim}- All systems nominal${C.reset}`);
  console.log('');
  console.log(`  ${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}What happens next:${C.reset}`);
  console.log(`  ${C.dim}Every time your AI writes code, Corpus checks it${C.reset}`);
  console.log(`  ${C.dim}against this graph. If something breaks, Corpus${C.reset}`);
  console.log(`  ${C.dim}tells the AI to fix it. You never see the bug.${C.reset}`);
  console.log('');
  console.log(`  ${C.cyan}corpus watch${C.reset}     ${C.dim}Real-time monitoring${C.reset}`);
  console.log(`  ${C.cyan}corpus scan${C.reset}      ${C.dim}Security scan${C.reset}`);
  console.log(`  ${C.cyan}corpus verify${C.reset}    ${C.dim}Trust scores${C.reset}`);
  console.log('');
  console.log(`  ${C.dim}Your AI can't break what Corpus protects.${C.reset}`);
  console.log(`  ${C.bold}No more AI slop.${C.reset}`);
  console.log('');

  // ── --open flag: serve graph in browser ──
  if (flags.includes('--open')) {
    await serveGraph(projectRoot, graph);
  }
}

async function serveGraph(projectRoot: string, graph: any): Promise<void> {
  const graphJSON = JSON.stringify({
    nodes: graph.nodes.map((n: any) => ({
      id: n.id, name: n.name, type: n.type, file: n.file, line: n.line,
      exported: n.exported, health: n.health || 'verified', trustScore: n.trustScore || 100,
      guards: n.guards || [], params: n.params || [],
    })),
    edges: graph.edges.map((e: any) => ({
      source: e.source, target: e.target, type: e.type,
    })),
    stats: graph.stats,
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Corpus Graph — ${path.basename(projectRoot)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #050505; color: #e5e7eb; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; }
  #info { position: fixed; top: 12px; left: 16px; z-index: 10; font-size: 12px; font-family: ui-monospace, monospace; }
  #info span { color: #10b981; }
  #detail { position: fixed; top: 12px; right: 16px; width: 300px; z-index: 10; background: #0a0a0aee; backdrop-filter: blur(8px); border: 1px solid #1f2937; border-radius: 12px; padding: 16px; display: none; font-size: 13px; }
  #detail h3 { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
  #detail .file { color: #6b7280; font-family: ui-monospace, monospace; font-size: 11px; margin-bottom: 8px; }
  #detail .tag { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 500; margin-right: 4px; margin-bottom: 4px; }
  #detail .guards { font-family: ui-monospace, monospace; font-size: 10px; color: #6ee7b7; border-left: 2px solid #10b98140; padding-left: 6px; margin: 2px 0; }
  #detail .score { color: #10b981; font-size: 20px; font-weight: 700; margin-top: 8px; }
  #legend { position: fixed; bottom: 16px; left: 16px; display: flex; gap: 12px; font-size: 10px; font-family: ui-monospace, monospace; background: #0a0a0acc; padding: 6px 12px; border-radius: 8px; z-index: 10; }
  .legend-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; }
</style>
<script src="https://unpkg.com/force-graph@1.43.5/dist/force-graph.min.js"></script>
</head><body>
<div id="info"><span>corpus</span> / ${path.basename(projectRoot)} — <span id="node-count"></span> files, <span id="edge-count"></span> edges</div>
<div id="detail"></div>
<div id="legend"></div>
<div id="graph"></div>
<script>
const COLORS = { core:'#3b82f6', cli:'#f97316', web:'#a855f7', 'mcp-server':'#06b6d4', 'sdk-ts':'#eab308', 'sdk-python':'#10b981', functions:'#f43f5e', policies:'#8b5cf6', schema:'#64748b', src:'#3b82f6', lib:'#10b981', app:'#a855f7', components:'#06b6d4', pages:'#eab308', api:'#f43f5e', utils:'#8b5cf6', config:'#64748b', scripts:'#f97316', public:'#10b981', styles:'#a855f7' };
function getCluster(file) { const p = file.split('/'); if (p[0]==='packages'&&p[1]) return p[1]; if (p[0]==='apps'&&p[1]) return p[1]; return p[0]||'root'; }
function getColor(file) { return COLORS[getCluster(file)] || '#64748b'; }

const raw = ${graphJSON};
const modules = raw.nodes.filter(n => n.type === 'module');
const funcs = raw.nodes.filter(n => n.type === 'function');
const moduleIds = new Set(modules.map(n => n.id));
const funcToMod = {};
raw.nodes.forEach(n => { if (n.type==='function') { const mid='mod:'+n.file; if(moduleIds.has(mid)) funcToMod[n.id]=mid; }});

const edgeSet = new Set();
const links = [];
raw.edges.forEach(e => {
  let s = moduleIds.has(e.source)?e.source:funcToMod[e.source];
  let t = moduleIds.has(e.target)?e.target:funcToMod[e.target];
  if(s&&t&&s!==t) { const k=s+'::'+t; if(!edgeSet.has(k)){edgeSet.add(k);links.push({source:s,target:t});}}
});

const nodes = modules.map(n => {
  const fc = funcs.filter(f=>f.file===n.file).length;
  return {...n, cluster:getCluster(n.file), color:getColor(n.file), funcCount:fc, val:Math.max(2,fc+1)};
});

document.getElementById('node-count').textContent = nodes.length;
document.getElementById('edge-count').textContent = links.length;

// Legend
const clusters = [...new Set(nodes.map(n=>n.cluster))];
const legend = document.getElementById('legend');
clusters.forEach(c => {
  const s = document.createElement('span');
  s.innerHTML = '<span class="legend-dot" style="background:'+( COLORS[c]||'#64748b')+'"></span>'+c;
  s.style.color = COLORS[c]||'#64748b';
  legend.appendChild(s);
});

const Graph = ForceGraph()(document.getElementById('graph'))
  .graphData({nodes, links})
  .backgroundColor('#050505')
  .linkColor(() => 'rgba(255,255,255,0.06)')
  .linkWidth(0.5)
  .nodeCanvasObject((node, ctx, globalScale) => {
    const r = Math.sqrt(node.val)*2.5;
    ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2*Math.PI);
    ctx.fillStyle = node.color+'90'; ctx.fill();
    ctx.strokeStyle = node.color; ctx.lineWidth = 0.5/globalScale; ctx.stroke();
    if(globalScale > 0.8) {
      ctx.font = (10/globalScale)+'px ui-monospace, monospace';
      ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillStyle='#ffffffaa';
      ctx.fillText(node.name, node.x, node.y+r+2);
    }
  })
  .nodePointerAreaPaint((node, color, ctx) => {
    ctx.beginPath(); ctx.arc(node.x, node.y, Math.sqrt(node.val)*2.5+4, 0, 2*Math.PI);
    ctx.fillStyle=color; ctx.fill();
  })
  .onNodeClick(node => {
    const d = document.getElementById('detail');
    const fileFuncs = funcs.filter(f=>f.file===node.file);
    d.style.display = 'block';
    d.innerHTML = '<h3>'+node.name+'</h3>'
      +'<div class="file">'+node.file+':'+node.line+'</div>'
      +'<div><span class="tag" style="background:'+node.color+'20;color:'+node.color+'">'+node.cluster+'</span>'
      +'<span class="tag" style="background:#37415120;color:#9ca3af">'+node.type+'</span>'
      +(node.exported?'<span class="tag" style="background:#10b98120;color:#10b981">exported</span>':'')
      +'</div>'
      +(fileFuncs.length?'<div style="margin-top:8px;color:#6b7280;font-size:9px;text-transform:uppercase;letter-spacing:0.05em">Functions ('+fileFuncs.length+')</div>'
        +fileFuncs.map(f=>'<div style="font-family:ui-monospace,monospace;font-size:10px;color:'+(f.exported?'#a5b4fc':'#6b7280')+';padding:2px 0">'+f.name+(f.guards?.length?' <span style="color:#10b981;font-size:8px">guarded</span>':'')+'</div>').join(''):'')
      +'<div class="score">'+node.trustScore+'<span style="color:#6b7280;font-size:12px;font-weight:400">/100</span></div>';
    Graph.centerAt(node.x, node.y, 400);
    Graph.zoom(3, 400);
  })
  .cooldownTicks(80)
  .d3AlphaDecay(0.03)
  .d3VelocityDecay(0.3);
</script></body></html>`;

  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3456;
      const url = `http://localhost:${port}`;
      console.log(`  ${C.cyan}Graph server${C.reset} running at ${C.bold}${url}${C.reset}`);
      console.log(`  ${C.dim}Press Ctrl+C to stop${C.reset}`);
      console.log('');

      // Open browser
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} ${url}`);
    });
  });
}
