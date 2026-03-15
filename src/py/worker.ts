/**
 * worker.ts – Pyodide Web Worker
 *
 * Runs Python (NetworkX) graph algorithms entirely in a background thread
 * so the UI never freezes.
 *
 * Message protocol  (main → worker):
 *   { id: string; type: 'connectivity' | 'toy_flood' | 'ping'; payload: unknown }
 *
 * Message protocol  (worker → main):
 *   { id: string; ok: true;  result: unknown }
 * | { id: string; ok: false; error: string  }
 *
 * Special messages:
 *   { id: '__status__'; ok: true; result: { status: 'loading'|'ready'; message: string } }
 */

// ─── Type imports ─────────────────────────────────────────────────────────────

interface PyodideInterface {
  runPythonAsync(code: string, options?: { globals?: unknown }): Promise<unknown>;
  loadPackage(names: string | string[]): Promise<void>;
  globals: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
}

type LoadPyodide = (opts: { indexURL: string }) => Promise<PyodideInterface>;

// ─── Globals ─────────────────────────────────────────────────────────────────

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';

let pyodide: PyodideInterface | null = null;
let initPromise: Promise<void> | null = null;

// ─── Initialisation ───────────────────────────────────────────────────────────

function postStatus(message: string, status: 'loading' | 'ready' | 'error'): void {
  self.postMessage({ id: '__status__', ok: true, result: { status, message } });
}

async function initPyodide(): Promise<void> {
  if (pyodide) return;

  postStatus('Downloading Pyodide runtime (30–50 MB)…', 'loading');

  // Dynamic import – works in ES module workers (no importScripts needed)
  const pyodideModule = await import(
    /* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`
  ) as { loadPyodide: LoadPyodide };

  postStatus('Compiling WebAssembly…', 'loading');
  pyodide = await pyodideModule.loadPyodide({ indexURL: PYODIDE_CDN });

  postStatus('Installing Python packages…', 'loading');
  await pyodide.loadPackage(['networkx']);

  // Pre-import modules for speed on first call
  postStatus('Initializing Python environment…', 'loading');
  await pyodide.runPythonAsync(`
import networkx as nx
print("NeerNet Pyodide ready: networkx", nx.__version__)
  `);

  postStatus('Pyodide ready', 'ready');
}

function ensureInit(): Promise<void> {
  if (!initPromise) initPromise = initPyodide();
  return initPromise;
}

// ─── Algorithms ───────────────────────────────────────────────────────────────

interface ConnectivityEdge { source: string; target: string; }
interface ConnectivityResult {
  num_components: number;
  component_sizes: number[];
  components: string[][];
}

async function runConnectivity(payload: unknown): Promise<ConnectivityResult> {
  const { edges } = payload as { edges: ConnectivityEdge[] };

  pyodide!.globals.set('edges_json', JSON.stringify(edges));

  const result = await pyodide!.runPythonAsync(`
import json, networkx as nx

edges_list = json.loads(edges_json)
G = nx.Graph()
G.add_edges_from((e['source'], e['target']) for e in edges_list)

comps = list(nx.connected_components(G))
comps_sorted = sorted(comps, key=len, reverse=True)

_result = json.dumps({
    "num_components": len(comps_sorted),
    "component_sizes": [len(c) for c in comps_sorted],
    "components": [list(c) for c in comps_sorted]
})
del edges_json
_result
  `);

  return JSON.parse(result as string) as ConnectivityResult;
}

// ──────────────────────────────────────────────────────────────────────────────

interface FloodPayload {
  edges: ConnectivityEdge[];
  source_nodes: string[];
  steps: number;
}
interface FloodResult {
  flooded_nodes: string[];
  steps_taken: number;
}

async function runToyFlood(payload: unknown): Promise<FloodResult> {
  const { edges, source_nodes, steps } = payload as FloodPayload;

  const stepsVal = Number.isFinite(steps) ? Math.max(1, Math.min(steps, 50)) : 5;

  pyodide!.globals.set('edges_json',    JSON.stringify(edges));
  pyodide!.globals.set('sources_json',  JSON.stringify(source_nodes));

  const result = await pyodide!.runPythonAsync(`
import json, networkx as nx

edges_list = json.loads(edges_json)
G = nx.Graph()
G.add_edges_from((e['source'], e['target']) for e in edges_list)

source_nodes = json.loads(sources_json)

# Filter to nodes actually in the graph (nodeMap may include isolated nodes)
valid_sources = [n for n in source_nodes if G.has_node(n)]
if not valid_sources:
    valid_sources = [next(iter(G.nodes()))] if G.number_of_nodes() > 0 else []

# BFS flood propagation
flooded    = set(valid_sources)
frontier   = list(valid_sources)
steps_done = 0

for _ in range(${stepsVal}):
    if not frontier:
        break
    next_frontier = []
    for node in frontier:
        if not G.has_node(node):
            continue
        for nb in G.neighbors(node):
            if nb not in flooded:
                flooded.add(nb)
                next_frontier.append(nb)
    frontier = next_frontier
    steps_done += 1

_result = json.dumps({
    "flooded_nodes": list(flooded),
    "steps_taken":   steps_done
})
del edges_json, sources_json, source_nodes
_result
  `);

  return JSON.parse(result as string) as FloodResult;
}

// ─── Risk Score ───────────────────────────────────────────────────────────────

interface RiskScoreResult {
  scores: Record<string, number>;
  max_score: number;
  source_count: number;
}

async function runRiskScore(payload: unknown): Promise<RiskScoreResult> {
  const { edges, source_nodes } = payload as { edges: ConnectivityEdge[]; source_nodes: string[] };

  pyodide!.globals.set('edges_json',   JSON.stringify(edges));
  pyodide!.globals.set('sources_json', JSON.stringify(source_nodes));

  const result = await pyodide!.runPythonAsync(`
import json, networkx as nx

edges_list = json.loads(edges_json)
G = nx.Graph()
G.add_edges_from((e['source'], e['target']) for e in edges_list)

n = G.number_of_nodes()
k = min(200, n)

# Approximate betweenness centrality (sampled for performance)
bc = nx.betweenness_centrality(G, k=k, normalized=True)

# BFS flood proximity from source nodes
source_nodes = json.loads(sources_json)
valid_sources = [s for s in source_nodes if G.has_node(s)]
dist_scores = {}
if valid_sources:
    for src in valid_sources:
        lengths = nx.single_source_shortest_path_length(G, src, cutoff=20)
        for node, d in lengths.items():
            flood_prox = max(0.0, 1.0 - d / 20.0)
            dist_scores[node] = max(dist_scores.get(node, 0.0), flood_prox)

# Combined risk: 50% betweenness + 50% flood proximity
scores = {}
for node in G.nodes():
    scores[node] = 0.5 * bc.get(node, 0.0) + 0.5 * dist_scores.get(node, 0.0)

max_score = max(scores.values()) if scores else 1.0

_result = json.dumps({
    "scores": scores,
    "max_score": max_score,
    "source_count": len(valid_sources)
})
del edges_json, sources_json
_result
  `);

  return JSON.parse(result as string) as RiskScoreResult;
}

// ─── Watershed Stats ──────────────────────────────────────────────────────────

interface WatershedStatsResult {
  node_count: number;
  edge_count: number;
  outlet_count: number;
  headwater_count: number;
  confluence_count: number;
  density: number;
  avg_degree: number;
  largest_component: number;
  component_count: number;
}

async function runWatershedStats(payload: unknown): Promise<WatershedStatsResult> {
  const { edges } = payload as { edges: ConnectivityEdge[] };

  pyodide!.globals.set('edges_json', JSON.stringify(edges));

  const result = await pyodide!.runPythonAsync(`
import json, networkx as nx

edges_list = json.loads(edges_json)
G = nx.Graph()
G.add_edges_from((e['source'], e['target']) for e in edges_list)
DG = nx.DiGraph()
DG.add_edges_from((e['source'], e['target']) for e in edges_list)

n = G.number_of_nodes()
m = G.number_of_edges()

outlet_count     = sum(1 for _, d in DG.in_degree()  if d == 0)
headwater_count  = sum(1 for _, d in DG.out_degree() if d == 0)
confluence_count = sum(1 for _, d in DG.in_degree()  if d >= 2)
comps = list(nx.connected_components(G))
largest = max((len(c) for c in comps), default=0)

_result = json.dumps({
    "node_count":        n,
    "edge_count":        m,
    "outlet_count":      outlet_count,
    "headwater_count":   headwater_count,
    "confluence_count":  confluence_count,
    "density":           round(nx.density(G), 6),
    "avg_degree":        round(sum(d for _, d in G.degree()) / n if n > 0 else 0, 2),
    "largest_component": largest,
    "component_count":   len(comps)
})
del edges_json
_result
  `);

  return JSON.parse(result as string) as WatershedStatsResult;
}

// ─── Critical Path ────────────────────────────────────────────────────────────

interface CriticalPathResult {
  articulation_points: string[];
  bridges: Array<[string, string]>;
  ap_count: number;
  bridge_count: number;
}

async function runCriticalPath(payload: unknown): Promise<CriticalPathResult> {
  const { edges } = payload as { edges: ConnectivityEdge[] };

  pyodide!.globals.set('edges_json', JSON.stringify(edges));

  const result = await pyodide!.runPythonAsync(`
import json, networkx as nx

edges_list = json.loads(edges_json)
G = nx.Graph()
G.add_edges_from((e['source'], e['target']) for e in edges_list)

aps = list(nx.articulation_points(G))
brs = list(nx.bridges(G))

_result = json.dumps({
    "articulation_points": aps,
    "bridges": [list(b) for b in brs],
    "ap_count": len(aps),
    "bridge_count": len(brs)
})
del edges_json
_result
  `);

  return JSON.parse(result as string) as CriticalPathResult;
}

// ─── Animated Flood BFS ───────────────────────────────────────────────────────

interface AnimatedFloodResult {
  frames: string[][];
}

async function runAnimatedFlood(payload: unknown): Promise<AnimatedFloodResult> {
  const { edges, source_nodes, steps } = payload as {
    edges: ConnectivityEdge[];
    source_nodes: string[];
    steps: number;
  };

  const stepsVal = Number.isFinite(steps) ? Math.max(1, Math.min(steps, 20)) : 10;

  pyodide!.globals.set('edges_json',   JSON.stringify(edges));
  pyodide!.globals.set('sources_json', JSON.stringify(source_nodes));

  const result = await pyodide!.runPythonAsync(`
import json, networkx as nx

edges_list = json.loads(edges_json)
G = nx.Graph()
for e in edges_list:
    G.add_edge(e['source'], e['target'])

source = json.loads(sources_json)
valid_source = [s for s in source if G.has_node(s)]

flooded  = set(valid_source)
frontier = set(valid_source)
frames   = [list(flooded)]

for _ in range(${stepsVal}):
    nxt = set()
    for n in list(frontier):
        if not G.has_node(n):
            continue
        for m in G.neighbors(n):
            if m not in flooded:
                nxt.add(m)
    flooded  |= nxt
    frontier  = nxt
    frames.append(list(flooded))
    if not frontier:
        break

_result = json.dumps({"frames": frames})
del edges_json, sources_json
_result
  `);

  return JSON.parse(result as string) as AnimatedFloodResult;
}

// ─── Job serialization queue ──────────────────────────────────────────────────
// Pyodide shares ONE Python namespace across all runPythonAsync calls. If two
// messages are handled concurrently (possible because onmessage is async and JS
// delivers the next message while the first is awaiting Pyodide), they corrupt
// shared Python variables (G, edges_json, …). This queue ensures strict serial
// execution: onmessage enqueues synchronously, jobs run one at a time.
let _jobQueue: Promise<void> = Promise.resolve();

// ─── Message dispatcher ───────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent) => {           // ← sync, NOT async
  const { id, type, payload } = event.data as {
    id: string;
    type: 'ping' | 'connectivity' | 'toy_flood' | 'risk_score' | 'watershed_stats' | 'critical_path' | 'animated_flood';
    payload: unknown;
  };

  // Simple liveness check (does NOT require Pyodide)
  if (type === 'ping') {
    self.postMessage({ id, ok: true, result: 'pong' });
    return;
  }

  // Append job to queue; previous job must complete before this one starts
  _jobQueue = _jobQueue.then(async () => {
    try {
      await ensureInit();

      let result: unknown;

      switch (type) {
        case 'connectivity':
          result = await runConnectivity(payload);
          break;
        case 'toy_flood':
          result = await runToyFlood(payload);
          break;
        case 'risk_score':
          result = await runRiskScore(payload);
          break;
        case 'watershed_stats':
          result = await runWatershedStats(payload);
          break;
        case 'critical_path':
          result = await runCriticalPath(payload);
          break;
        case 'animated_flood':
          result = await runAnimatedFlood(payload);
          break;
        default: {
          const exhaustive: never = type;
          throw new Error(`Unknown job type: ${exhaustive}`);
        }
      }

      self.postMessage({ id, ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ id, ok: false, error: message });
    }
  });
};

// ─── Eagerly start Pyodide download on worker creation ───────────────────────
ensureInit();
