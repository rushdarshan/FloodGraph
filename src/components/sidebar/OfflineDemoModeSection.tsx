import { CloudOff, Wifi, Map } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function OfflineDemoModeSection() {
  return (
    <section aria-labelledby="offline-demo-title">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle id="offline-demo-title" className="text-sm flex items-center gap-2">
            <CloudOff className="h-4 w-4" />
            Offline Demo Mode
          </CardTitle>
          <CardDescription className="text-xs">
            Download-pack mode is disabled for this demo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p className="flex items-start gap-2">
            <Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Offline works via cache-as-you-pan from the Service Worker.
          </p>
          <p className="flex items-start gap-2">
            <Map className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Demo flow: pan and zoom while online, switch DevTools to Offline, then reload.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
