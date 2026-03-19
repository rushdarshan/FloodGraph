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
      <Alert className='border-success/50 bg-success/10'>
        <CheckCircle2 className='h-4 w-4 text-success' />
        <AlertTitle className='text-sm text-success'>Analysis Engine Ready</AlertTitle>
        <AlertDescription className='text-xs text-success/80'>
          Flood analysis tools are loaded and ready.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'error') {
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle className='text-sm'>Could Not Start Analysis Engine</AlertTitle>
        <AlertDescription className='text-xs'>
          Refresh the page and try again. If the issue continues, check your internet connection.
        </AlertDescription>
      </Alert>
    );
  }

  const friendlyMessage = (msg: string) => {
    if (msg.includes('Downloading')) return 'Downloading analysis engine (30–50 MB)…';
    if (msg.includes('WebAssembly') || msg.includes('Compiling')) return 'Starting analysis engine…';
    if (msg.includes('packages') || msg.includes('Installing')) return 'Loading analysis packages…';
    if (msg.includes('Initializing') || msg.includes('environment')) return 'Preparing analysis tools…';
    return msg || 'Starting up…';
  };

  return (
    <Alert>
      <Loader2 className='h-4 w-4 animate-spin' />
      <AlertTitle className='text-sm'>Loading Analysis Engine</AlertTitle>
      <AlertDescription className='text-xs space-y-2'>
        <p>{friendlyMessage(message)}</p>
        <p className='text-muted-foreground text-xs'>
          First run downloads about 40 MB. It will be cached for later use.
        </p>
        {progress > 0 && (
          <>
            <Progress value={progress} className='h-1.5' aria-label="Loading progress" />
            <p className='text-right text-muted-foreground text-xs'>{progress}%</p>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
