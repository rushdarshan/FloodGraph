import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

interface BoundaryStatusSectionProps {
  vertices: number;
}

export function BoundaryStatusSection({ vertices }: BoundaryStatusSectionProps) {
  return (
    <section aria-labelledby="boundary-status-title">
      <Card>
        <CardContent className="pt-4">
          <div className="bg-success/10 text-success rounded-md p-3 text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-medium" id="boundary-status-title">Boundary ready</p>
              <p className="text-xs mt-1 text-success/80 break-words">{vertices} corner points</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
