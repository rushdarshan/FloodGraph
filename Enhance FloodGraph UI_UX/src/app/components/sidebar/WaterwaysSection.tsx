import { Waves, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

interface WaterwaysSectionProps {
  loaded: boolean;
  count: number;
  aoiComplete: boolean;
  onFetch: () => void;
}

export function WaterwaysSection({ loaded, count, aoiComplete, onFetch }: WaterwaysSectionProps) {
  return (
    <section aria-labelledby="waterways-title">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle id="waterways-title" className="text-sm flex items-center gap-2">
            <Waves className="h-4 w-4" />
            Kerala Waterways
          </CardTitle>
          <CardDescription className="text-xs">
            Fetch OSM data and build proximity graph
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!aoiComplete && (
            <div className="bg-muted rounded-md p-3 text-sm flex items-start gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs">
                Complete AOI drawing first
              </p>
            </div>
          )}
          
          {aoiComplete && !loaded && (
            <Button 
              onClick={onFetch} 
              className="w-full"
              aria-label="Fetch Kerala waterways data"
            >
              <Download className="h-4 w-4 mr-2" />
              Fetch Kerala Waterways
            </Button>
          )}
          
          {loaded && (
            <div className="space-y-2">
              <div className="bg-green-500/10 text-green-700 dark:text-green-400 rounded-md p-3 text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Data Loaded</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {count.toLocaleString()} waterways
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
