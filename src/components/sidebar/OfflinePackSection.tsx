import { useState, useEffect } from 'react';
import { Download, CheckCircle2, AlertCircle, Package, Loader2 } from 'lucide-react';
import type { Map as MLMap } from 'maplibre-gl';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import {
  ENABLE_OFFLINE_PACK_DOWNLOADS,
  OFFLINE_PACK_SELECTED_KEY,
  type OfflinePack,
  checkPackReadiness,
  applyOfflinePack,
  getPackRequiredUrls,
  loadOfflinePackIndex,
  OFFLINE_PACKS_CACHE_NAME,
} from '../../offlinePacks.js';

function formatBytes(b: number): string {
  if (b === 0) return '?';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

async function downloadIntoCache(
  url: string,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, { mode: 'cors', signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} – ${url}`);

  const total = parseInt(response.headers.get('Content-Length') ?? '0', 10);
  if (!response.body) {
    throw new Error(`No response body returned for ${url}`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total || received);
  }

  const blob = new Blob(chunks as unknown as BlobPart[]);
  const cachedRes = new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Length': String(blob.size),
    },
  });

  const cache = await caches.open(OFFLINE_PACKS_CACHE_NAME);
  await cache.put(url, cachedRes);
}

interface PackCardProps {
  pack: OfflinePack;
  map: MLMap | null;
  onNotice: (message: string) => void;
}

function PackCard({ pack, map, onNotice }: PackCardProps) {
  const [status, setStatus] = useState<'checking' | 'idle' | 'downloading' | 'cached' | 'error'>('checking');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [missingAssets, setMissingAssets] = useState<string[]>([]);

  const assessReadiness = async () => {
    const readiness = await checkPackReadiness(pack);
    setMissingAssets(readiness.missingUrls);
    setStatus(readiness.ready ? 'cached' : 'idle');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('caches' in window)) {
        if (!cancelled) {
          setStatus('error');
          setMessage('Offline caching is not supported in this browser.');
        }
        return;
      }

      if (!cancelled) {
        await assessReadiness();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.id]);

  const handleDownload = async () => {
    if (!('caches' in window)) {
      setStatus('error');
      setMessage('Offline caching is not supported in this browser.');
      return;
    }

    const abortController = new AbortController();
    setStatus('downloading');
    setProgress(0);
    setMessage('');

    const urls = getPackRequiredUrls(pack);

    try {
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        setMessage(`Downloading ${url.split('/').pop() ?? url} (${i + 1}/${urls.length})…`);

        await downloadIntoCache(url, (recv, total) => {
          const fileStart = (i / urls.length) * 100;
          const fileEnd = ((i + 1) / urls.length) * 100;
          const filePct = total > 0 ? recv / total : 0;
          const overallPct = fileStart + filePct * (fileEnd - fileStart);
          setProgress(Math.round(overallPct));
          setMessage(`Downloading ${url.split('/').pop()}… ${formatBytes(recv)}/${formatBytes(total)}`);
        }, abortController.signal);
      }
      setProgress(100);
      await assessReadiness();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessage('Download cancelled.');
      } else {
        setMessage(err instanceof Error ? err.message : String(err));
      }
      setStatus('error');
    } finally {
      abortController.abort();
    }
  };

  const handleApplyPack = async () => {
    if (!map) {
      onNotice('Map is still loading. Try applying the pack in a moment.');
      return;
    }

    const readiness = await checkPackReadiness(pack);
    if (!readiness.ready) {
      setMissingAssets(readiness.missingUrls);
      onNotice('Pack is not ready yet. Repair download first.');
      return;
    }

    try {
      await applyOfflinePack(map, pack);
      localStorage.setItem(OFFLINE_PACK_SELECTED_KEY, pack.id);
      onNotice(`Applied offline pack: ${pack.name}`);
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      onNotice(`Could not apply pack: ${errMessage}`);
    }
  };

  const downloadsEnabled = ENABLE_OFFLINE_PACK_DOWNLOADS && !pack.demo_only;
  const canApply = status === 'cached' && map !== null;

  return (
    <div className="space-y-2 rounded-lg border border-border p-3 bg-card">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium">{pack.name}</p>
          <p className="text-xs text-muted-foreground break-words">{pack.description}</p>
          {pack.demo_only && (
            <p className="text-xs text-warning mt-1">Demo-only metadata. Downloads are disabled until a production regional pack is provided.</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground pl-2 shrink-0">~{pack.size_mb_approx} MB</span>
      </div>

      {status === 'checking' && (
        <p className="text-xs text-muted-foreground">Checking local cache…</p>
      )}

      {status === 'idle' && (
        <Button onClick={handleDownload} variant="outline" className="w-full" size="sm" disabled={!downloadsEnabled}>
          <Download className="h-3 w-3 mr-1" />
          {downloadsEnabled ? 'Download Pack' : 'Download Disabled'}
        </Button>
      )}

      {status === 'downloading' && (
        <div className="space-y-1">
          <div className="flex items-start gap-2 min-w-0" aria-live="polite">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs text-muted-foreground break-words">{message}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-right">{progress}%</p>
        </div>
      )}

      {status === 'cached' && (
        <Alert className="border-success/50 bg-success/10 py-2 space-y-2">
          <CheckCircle2 className="h-3 w-3 text-success" />
          <AlertDescription className="text-xs text-success">
            All required assets are cached and ready for offline use.
          </AlertDescription>
          <Button onClick={handleApplyPack} variant="outline" className="w-full" size="sm" disabled={!canApply}>
            Apply Pack
          </Button>
        </Alert>
      )}

      {status === 'error' && (
        <div className="space-y-1">
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-3 w-3" />
            <AlertDescription className="text-xs break-words">{message}</AlertDescription>
          </Alert>
          <Button onClick={handleDownload} variant="outline" className="w-full" size="sm" disabled={!downloadsEnabled}>
            Repair Download
          </Button>
        </div>
      )}

      {missingAssets.length > 0 && (
        <div className="text-xs text-muted-foreground rounded-md border border-border p-2 space-y-1">
          <p className="font-medium">Missing assets:</p>
          {missingAssets.map((asset) => (
            <p key={asset} className="break-all">• {asset.replace(`${window.location.origin}/`, '')}</p>
          ))}
          <Button onClick={handleDownload} variant="outline" className="w-full mt-2" size="sm" disabled={!downloadsEnabled}>
            Repair Download
          </Button>
        </div>
      )}

      {!ENABLE_OFFLINE_PACK_DOWNLOADS && (
        <Alert className="border-warning/50 bg-warning/10 py-2">
          <AlertCircle className="h-3 w-3 text-warning" />
          <AlertDescription className="text-xs text-warning break-words">
            Download-pack mode is disabled by feature flag. Set VITE_ENABLE_OFFLINE_PACKS=true after adding a validated regional PMTiles pack.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

interface OfflinePackSectionProps {
  map: MLMap | null;
  onNotice?: (message: string) => void;
}

export function OfflinePackSection({ map, onNotice }: OfflinePackSectionProps) {
  const [packs, setPacks] = useState<OfflinePack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleNotice = (message: string) => {
    setNotice(message);
    onNotice?.(message);
  };

  const loadPackIndex = async () => {
    const nextPacks = await loadOfflinePackIndex();
    setPacks(nextPacks);
    setError(null);
  };

  useEffect(() => {
    const abortController = new AbortController();

    (async () => {
      try {
        await loadPackIndex();
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => abortController.abort();
  }, []);

  return (
    <section aria-labelledby="offline-title">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle id="offline-title" className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" />
            Offline Packs
          </CardTitle>
          <CardDescription className="text-xs">
            Download map tiles for offline use
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs break-words">
                Could not load pack index: {error}
              </AlertDescription>
            </Alert>
          )}
          {packs.length === 0 && !error && (
            <p className="text-xs text-muted-foreground">Loading available offline packs…</p>
          )}
          {packs.map((pack) => (
            <PackCard key={pack.id} pack={pack} map={map} onNotice={handleNotice} />
          ))}
          {notice && (
            <Alert className="border-info/50 bg-info/10">
              <AlertDescription className="text-xs text-info break-words">{notice}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={async () => {
                try {
                  await loadPackIndex();
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              Retry Loading Offline Packs
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
