import { BarChart3, Share2, GitBranch, Layers } from 'lucide-react';
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
            Computation Results
          </CardTitle>
          <CardDescription className="text-xs">
            Graph analysis statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 text-sm">
                <Share2 className="h-4 w-4 text-muted-foreground" />
                <span>Nodes</span>
              </div>
              <Badge variant="secondary">{nodesCount.toLocaleString()}</Badge>
            </div>

            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 text-sm">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span>Edges</span>
              </div>
              <Badge variant="secondary">{edgesCount.toLocaleString()}</Badge>
            </div>

            <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span>Components</span>
              </div>
              <Badge variant="secondary">{componentsCount}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
