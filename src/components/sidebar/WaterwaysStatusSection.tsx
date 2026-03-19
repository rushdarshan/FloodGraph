import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';

interface WaterwaysStatusSectionProps {
  waterwaysCount: number;
  componentsCount: number;
}

export function WaterwaysStatusSection({ waterwaysCount, componentsCount }: WaterwaysStatusSectionProps) {
  return (
    <section aria-labelledby="waterways-status-title">
      <Card>
        <CardContent className="pt-4">
          <div className="bg-green-500/10 text-green-400 rounded-md p-3 text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium" id="waterways-status-title">Waterway data loaded</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {waterwaysCount.toLocaleString()} sections
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {componentsCount} network{componentsCount !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
