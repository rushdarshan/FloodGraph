import { Download, CheckCircle2, AlertCircle, Package } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';

interface OfflinePackSectionProps {
  status: 'idle' | 'downloading' | 'cached' | 'error';
  progress: number;
  error?: string;
  onDownload: () => void;
}

export function OfflinePackSection({ status, progress, error, onDownload }: OfflinePackSectionProps) {
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
          {status === 'idle' && (
            <Button 
              onClick={onDownload} 
              variant="outline"
              className="w-full"
              aria-label="Download offline map pack"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Offline Pack
            </Button>
          )}
          
          {status === 'downloading' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Downloading tiles...</p>
              <Progress value={progress} className="h-2" aria-label={`Download progress: ${progress}%`} />
              <p className="text-xs text-muted-foreground text-right">{progress}%</p>
            </div>
          )}
          
          {status === 'cached' && (
            <Alert className="border-green-500/50 bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-xs text-green-600 dark:text-green-400">
                Offline pack cached and ready
              </AlertDescription>
            </Alert>
          )}
          
          {status === 'error' && error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {error}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
