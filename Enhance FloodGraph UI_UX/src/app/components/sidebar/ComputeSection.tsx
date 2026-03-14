import { Cpu, Play, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { ComputeStatus } from '../../App';

interface ComputeSectionProps {
  status: ComputeStatus;
  progress: number;
  pyodideReady: boolean;
  aoiComplete: boolean;
  onRunConnectivity: () => void;
  onRunFloodBFS: () => void;
}

export function ComputeSection({ 
  status, 
  progress, 
  pyodideReady, 
  aoiComplete,
  onRunConnectivity,
  onRunFloodBFS 
}: ComputeSectionProps) {
  const canRun = pyodideReady && aoiComplete;

  return (
    <section aria-labelledby="compute-title">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle id="compute-title" className="text-sm flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Graph Compute (Pyodide)
          </CardTitle>
          <CardDescription className="text-xs">
            Run graph algorithms in-browser
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canRun && (
            <div className="bg-muted rounded-md p-3 text-sm flex items-start gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                {!pyodideReady && <p>Waiting for Pyodide to load...</p>}
                {pyodideReady && !aoiComplete && <p>Complete AOI and fetch waterways first</p>}
              </div>
            </div>
          )}
          
          {status === 'running' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-muted-foreground">Computing...</span>
              </div>
              <Progress value={progress} className="h-2" aria-label={`Computation progress: ${progress}%`} />
              <p className="text-xs text-muted-foreground text-right">{progress}%</p>
            </div>
          )}
          
          {canRun && status !== 'running' && (
            <div className="space-y-2">
              <Button 
                onClick={onRunConnectivity} 
                className="w-full"
                disabled={!canRun}
                aria-label="Run connectivity analysis"
              >
                <Play className="h-4 w-4 mr-2" />
                Run Connectivity
              </Button>
              <Button 
                onClick={onRunFloodBFS} 
                variant="outline"
                className="w-full"
                disabled={!canRun}
                aria-label="Run flood BFS simulation"
              >
                <Play className="h-4 w-4 mr-2" />
                Run Flood BFS
              </Button>
            </div>
          )}
          
          {status === 'complete' && (
            <p className="text-xs text-green-600 dark:text-green-400 text-center">
              ✓ Computation complete
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
