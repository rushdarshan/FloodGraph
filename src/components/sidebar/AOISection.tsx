import { PenTool, Trash2, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface AOISectionProps {
  status: 'idle' | 'drawing' | 'complete';
  vertices: number;
  onStartDrawing: () => void;
  onClear: () => void;
}

export function AOISection({ status, vertices, onStartDrawing, onClear }: AOISectionProps) {
  return (
    <section aria-labelledby="aoi-title">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle id="aoi-title" className="text-sm flex items-center gap-2">
            <PenTool className="h-4 w-4" />
            Study Area (Optional)
          </CardTitle>
          <CardDescription className="text-xs">
            Draw a boundary on the map to mark your area of interest
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === 'idle' && (
            <Button onClick={onStartDrawing} className="w-full" aria-label="Start drawing boundary">
              <PenTool className="h-4 w-4 mr-2" />
              Draw Study Boundary
            </Button>
          )}
          {status === 'drawing' && (
            <div className="bg-primary/10 text-primary rounded-md p-3 text-sm">
              <p className="font-medium">Drawing boundary…</p>
              <p className="text-xs mt-1">
                Click on the map to add corners ({vertices} added)
                <br />
                Double-click to finish drawing
              </p>
            </div>
          )}
          {status === 'complete' && (
            <div className="space-y-2">
              <div className="bg-green-500/10 text-green-400 rounded-md p-3 text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Boundary Drawn</p>
                  <p className="text-xs mt-1">{vertices} corner points</p>
                </div>
              </div>
              <Button onClick={onClear} variant="outline" className="w-full" aria-label="Clear study boundary">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Boundary
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
