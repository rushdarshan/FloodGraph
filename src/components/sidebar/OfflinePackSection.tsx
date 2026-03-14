import { useState, useEffect } from 'react';
import { Download, CheckCircle2, AlertCircle, Package, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';

interface OfflinePack {
  id: string;
  name: string;
  description: string;
  pmtiles_url: string;
  style_url: string;
  sprite_urls: string[];
  glyph_url_prefix: string;
  size_mb_approx: number;
  bbox: [number, number, number, number];
}

interface PackIndex {
  version: string;
  packs: OfflinePack[];
}

const PACK_CACHE_NAME = 'neernet-offline-packs-v1';

function formatBytes(b: number): string {
  if (b === 0) return '?';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

async function downloadIntoCache(
  url: string,
  cacheName: string,
  onProgress: (received: number, total: number) => void,
): Promise<void> {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`HTTP ${response.status} – ${url}`);

  const total = parseInt(response.headers.get('Content-Length') ?? '0', 10);
  const reader = response.body!.getReader();
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

  const cache = await caches.open(cacheName);
  await cache.put(url, cachedRes);
}

interface PackCardProps {
  pack: OfflinePack;
}

function PackCard({ pack }: PackCardProps) {
  const [status, setStatus] = useState<'checking' | 'idle' | 'downloading' | 'cached' | 'error'>('checking');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const cache = await caches.open(PACK_CACHE_NAME);
      const resp = await cache.match(pack.pmtiles_url);
      setStatus(resp ? 'cached' : 'idle');
    })();
  }, [pack.pmtiles_url]);

  const handleDownload = async () => {
    setStatus('downloading');
    setProgress(0);
    setMessage('');

    const urls = [pack.style_url, pack.pmtiles_url, ...pack.sprite_urls];

    try {
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        setMessage(`Downloading ${url.split('/').pop() ?? url} (${i + 1}/${urls.length})…`);

        await downloadIntoCache(url, PACK_CACHE_NAME, (recv, total) => {
          const fileStart = (i / urls.length) * 100;
          const fileEnd = ((i + 1) / urls.length) * 100;
          const filePct = total > 0 ? recv / total : 0;
          const overallPct = fileStart + filePct * (fileEnd - fileStart);
          setProgress(Math.round(overallPct));
          setMessage(`Downloading ${url.split('/').pop()}… ${formatBytes(recv)}/${formatBytes(total)}`);
        });
      }
      setProgress(100);
      setStatus('cached');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3 bg-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium">{pack.name}</p>
          <p className="text-xs text-muted-foreground">{pack.description}</p>
        </div>
        <span className="text-xs text-muted-foreground">~{pack.size_mb_approx} MB</span>
      </div>

      {status === 'checking' && (
        <p className="text-xs text-muted-foreground">Checking cache…</p>
      )}

      {status === 'idle' && (
        <Button onClick={handleDownload} variant="outline" className="w-full" size="sm">
          <Download className="h-3 w-3 mr-1" />
          Download
        </Button>
      )}

      {status === 'downloading' && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs text-muted-foreground">{message}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-right">{progress}%</p>
        </div>
      )}

      {status === 'cached' && (
        <Alert className="border-green-500/50 bg-green-500/10 py-2">
          <CheckCircle2 className="h-3 w-3 text-green-400" />
          <AlertDescription className="text-xs text-green-400">
            Cached on device
          </AlertDescription>
        </Alert>
      )}

      {status === 'error' && (
        <div className="space-y-1">
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-3 w-3" />
            <AlertDescription className="text-xs">{message}</AlertDescription>
          </Alert>
          <Button onClick={handleDownload} variant="outline" className="w-full" size="sm">
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

export function OfflinePackSection() {
  const [packs, setPacks] = useState<OfflinePack[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${import.meta.env.BASE_URL}offline-packs.json`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const idx = (await resp.json()) as PackIndex;
        setPacks(idx.packs);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
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
            Download tiles for offline use
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Could not load pack index: {error}
              </AlertDescription>
            </Alert>
          )}
          {packs.length === 0 && !error && (
            <p className="text-xs text-muted-foreground">Loading pack index…</p>
          )}
          {packs.map((pack) => (
            <PackCard key={pack.id} pack={pack} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
