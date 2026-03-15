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
      <Alert className='border-green-500/50 bg-green-500/10'>
        <CheckCircle2 className='h-4 w-4 text-green-400' />
        <AlertTitle className='text-sm text-green-400'>Analysis Engine Ready</AlertTitle>
        <AlertDescription className='text-xs text-green-400/80'>
          Flood analysis tools are loaded and ready to use
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'error') {
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle className='text-sm'>Analysis Engine Failed to Load</AlertTitle>
        <AlertDescription className='text-xs'>
          Could not start flood analysis tools. Please refresh the page and try again.
        </AlertDescription>
      </Alert>
    );
  }

  const friendlyMessage = (msg: string) => {
    if (msg.includes('Downloading')) return 'Downloading flood analysis engine (30–50 MB)…';
    if (msg.includes('WebAssembly') || msg.includes('Compiling')) return 'Starting analysis engine…';
    if (msg.includes('packages') || msg.includes('Installing')) return 'Loading waterway analysis packages…';
    if (msg.includes('Initializing') || msg.includes('environment')) return 'Preparing analysis tools…';
    return msg || 'Starting up…';
  };

  return (
    <Alert>
      <Loader2 className='h-4 w-4 animate-spin' />
      <AlertTitle className='text-sm'>Loading Analysis Engine</AlertTitle>
      <AlertDescription className='text-xs space-y-2'>
        <p>{friendlyMessage(message)}</p>
        <p className='text-muted-foreground text-[10px]'>
          First load downloads ~40 MB · cached for offline use afterwards
        </p>
        {progress > 0 && (
          <>
            <Progress value={progress} className='h-1.5' aria-label="Loading progress" />
            <p className='text-right text-muted-foreground'>{progress}%</p>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
