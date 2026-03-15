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

# BFS flood propagation
flooded    = set(source_nodes)
frontier   = list(source_nodes)
steps_done = 0

for _ in range(${stepsVal}):
    if not frontier:
        break
    next_frontier = []
    for node in frontier:
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

// ─── Message dispatcher ───────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data as {
    id: string;
    type: 'ping' | 'connectivity' | 'toy_flood';
    payload: unknown;
  };

  // Simple liveness check (does NOT require Pyodide)
  if (type === 'ping') {
    self.postMessage({ id, ok: true, result: 'pong' });
    return;
  }

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
};

// ─── Eagerly start Pyodide download on worker creation ───────────────────────
ensureInit();
