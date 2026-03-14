import { PenTool, Trash2, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { AOIStatus } from '../../App';

interface AOISectionProps {
  status: AOIStatus;
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
            Area of Interest (AOI)
          </CardTitle>
          <CardDescription className="text-xs">
            Draw a polygon on the map to define your area
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === 'idle' && (
            <Button 
              onClick={onStartDrawing} 
              className="w-full"
              aria-label="Start drawing polygon"
            >
              <PenTool className="h-4 w-4 mr-2" />
              Draw AOI Polygon
            </Button>
          )}
          
          {status === 'drawing' && (
            <div className="space-y-2">
              <div className="bg-primary/10 text-primary rounded-md p-3 text-sm">
                <p className="font-medium">Drawing mode active</p>
                <p className="text-xs mt-1">
                  Click to add vertices ({vertices} added)
                  <br />
                  Double-click to finish
                </p>
              </div>
            </div>
          )}
          
          {status === 'complete' && (
            <div className="space-y-2">
              <div className="bg-green-500/10 text-green-700 dark:text-green-400 rounded-md p-3 text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">AOI Complete</p>
                  <p className="text-xs mt-1">
                    {vertices} vertices defined
                  </p>
                </div>
              </div>
              <Button 
                onClick={onClear} 
                variant="outline" 
                className="w-full"
                aria-label="Clear area of interest"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear AOI
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
