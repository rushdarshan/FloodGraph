import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Progress } from '../ui/progress';

interface PyodideStatusProps {
  status: 'loading' | 'ready' | 'error';
  progress: number;
  message: string;
}

export function PyodideStatus({ status, progress, message }: PyodideStatusProps) {
  if (status === 'ready') {
    return (
      <Alert className="border-green-500/50 bg-green-500/10">
        <CheckCircle2 className="h-4 w-4 text-green-400" />
        <AlertTitle className="text-sm text-green-400">
          Pyodide Ready
        </AlertTitle>
        <AlertDescription className="text-xs text-green-400/80">
          Python runtime loaded successfully
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle className="text-sm">Pyodide Error</AlertTitle>
        <AlertDescription className="text-xs">
          Failed to load Python runtime. Please refresh the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <Loader2 className="h-4 w-4 animate-spin" />
      <AlertTitle className="text-sm">Loading Pyodide</AlertTitle>
      <AlertDescription className="text-xs space-y-2">
        <p>{message || 'Initializing Python runtime in browser...'}</p>
        {progress > 0 && (
          <>
            <Progress value={progress} className="h-1.5" aria-label={`Pyodide loading: ${progress}%`} />
            <p className="text-right text-muted-foreground">{progress}%</p>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
