import { BarChart3, Waves, GitBranch, Network } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

interface ResultsSectionProps {
  nodesCount: number;
  edgesCount: number;
  componentsCount: number;
}

export function ResultsSection({ nodesCount, edgesCount, componentsCount }: ResultsSectionProps) {
  return (
    <section aria-labelledby="results-title">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle id="results-title" className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analysis Summary
          </CardTitle>
          <CardDescription className="text-xs">Results from the last computation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 text-sm">
                <Waves className="h-4 w-4 text-muted-foreground" />
                <span>Waterway sections</span>
              </div>
              <Badge variant="secondary">{nodesCount.toLocaleString()}</Badge>
            </div>
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 text-sm">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span>Connections mapped</span>
              </div>
              <Badge variant="secondary">{edgesCount.toLocaleString()}</Badge>
            </div>
            {componentsCount > 0 && (
              <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <div className="flex items-center gap-2 text-sm">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  <span>Distinct networks</span>
                </div>
                <Badge variant="secondary">{componentsCount}</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
