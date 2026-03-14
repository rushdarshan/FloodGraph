/**
 * client.ts – Typed client for the Pyodide Web Worker.
 *
 * Wraps the raw postMessage protocol into clean, Promise-based calls.
 * Each call gets a unique ID so concurrent requests don't interfere.
 */

// ─── Wire types ───────────────────────────────────────────────────────────────

interface WorkerRequest {
  id: string;
  type: string;
  payload: unknown;
}

interface WorkerResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface StatusResult {
  status: 'loading' | 'ready' | 'error';
  message: string;
}

// ─── Public API types ─────────────────────────────────────────────────────────

export interface ConnectivityEdge { source: string; target: string; }

export interface ConnectivityResult {
  num_components: number;
  component_sizes: number[];
  components: string[][];
}

export interface FloodResult {
  flooded_nodes: string[];
  steps_taken:   number;
}

export type StatusHandler = (status: StatusResult) => void;

// ─── PyWorkerClient ───────────────────────────────────────────────────────────

export class PyWorkerClient {
  private worker: Worker;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private statusHandlers = new Set<StatusHandler>();
  private _idCounter = 0;

  constructor() {
    this.worker = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;

      // Status messages are broadcast, not request/response
      if (msg.id === '__status__') {
        for (const h of this.statusHandlers) {
          h(msg.result as StatusResult);
        }
        return;
      }

      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);

      if (msg.ok) {
        pending.resolve(msg.result);
      } else {
        pending.reject(new Error(msg.error ?? 'Worker error'));
      }
    };

    this.worker.onerror = (e) => {
      console.error('[PyWorkerClient] Uncaught worker error', e);
      // Reject all pending requests
      for (const [id, { reject }] of this.pending) {
        reject(new Error('Worker crashed'));
        this.pending.delete(id);
      }
    };
  }

  // ─── Status subscription ─────────────────────────────────────────────────────

  onStatus(handler: StatusHandler): void {
    this.statusHandlers.add(handler);
  }

  offStatus(handler: StatusHandler): void {
    this.statusHandlers.delete(handler);
  }

  // ─── Low-level call ───────────────────────────────────────────────────────────

  private _call<T>(type: string, payload: unknown, timeoutMs = 120_000): Promise<T> {
    const id   = `${type}_${++this._idCounter}_${Date.now()}`;
    const msg: WorkerRequest = { id, type, payload };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Worker call "${type}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v as T); },
        reject:  (e) => { clearTimeout(timer); reject(e); },
      });

      this.worker.postMessage(msg);
    });
  }

  // ─── High-level API ───────────────────────────────────────────────────────────

  /**
   * Lightweight liveness check – does NOT load Pyodide.
   */
  ping(): Promise<'pong'> {
    return this._call<'pong'>('ping', null, 5_000);
  }

  /**
   * Compute connected components of an undirected graph.
   * Pyodide + networkx will be loaded lazily on the first call.
   */
  connectivity(edges: ConnectivityEdge[]): Promise<ConnectivityResult> {
    return this._call<ConnectivityResult>('connectivity', { edges }, 180_000);
  }

  /**
   * Run a simple BFS flood simulation.
   * @param edges        Graph edges
   * @param sourceNodes  Starting flood nodes
   * @param steps        Maximum BFS depth
   */
  toyFlood(
    edges: ConnectivityEdge[],
    sourceNodes: string[],
    steps = 5,
  ): Promise<FloodResult> {
    return this._call<FloodResult>(
      'toy_flood',
      { edges, source_nodes: sourceNodes, steps },
      180_000,
    );
  }

  /** Terminate the underlying worker. */
  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}

// ─── Singleton helper ─────────────────────────────────────────────────────────

let _client: PyWorkerClient | null = null;

/** Get (or create) the shared PyWorkerClient singleton. */
export function getPyWorker(): PyWorkerClient {
  if (!_client) _client = new PyWorkerClient();
  return _client;
}
