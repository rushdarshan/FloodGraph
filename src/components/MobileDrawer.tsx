import type { Map as MLMap } from 'maplibre-gl';
import type { WaterwayGraphData } from './sidebar/WaterwaysSection';
import { AOISection } from './sidebar/AOISection';
import { WaterwaysSection } from './sidebar/WaterwaysSection';
import { ComputeSection } from './sidebar/ComputeSection';
import { OfflinePackSection } from './sidebar/OfflinePackSection';
import { PyodideStatus } from './sidebar/PyodideStatus';
import { ResultsSection } from './sidebar/ResultsSection';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  map: MLMap | null;
  pyodideStatus: 'loading' | 'ready' | 'error';
  pyodideProgress: number;
  pyodideMessage: string;
  aoiStatus: 'idle' | 'drawing' | 'complete';
  aoiVertices: number;
  computeResult: { nodesCount: number; edgesCount: number; componentsCount: number } | null;
  waterwayGraph: WaterwayGraphData | null;
  selectedFloodSource: string | null;
  onStartDrawing: () => void;
  onClearAoi: () => void;
  onComputeResult: (data: { nodesCount: number; edgesCount: number; componentsCount: number }) => void;
  onWaterwaysResult: (waterways: number, components: number, graphData: WaterwayGraphData) => void;
}

export function MobileDrawer({
  open,
  onOpenChange,
  map,
  pyodideStatus,
  pyodideProgress,
  pyodideMessage,
  aoiStatus,
  aoiVertices,
  computeResult,
  waterwayGraph,
  selectedFloodSource,
  onStartDrawing,
  onClearAoi,
  onComputeResult,
  onWaterwaysResult,
}: MobileDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>FloodGraph Controls</DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 pb-8">
            <PyodideStatus
              status={pyodideStatus}
              progress={pyodideProgress}
              message={pyodideMessage}
            />

            <Separator />

            <AOISection
              status={aoiStatus}
              vertices={aoiVertices}
              onStartDrawing={() => {
                onStartDrawing();
                onOpenChange(false);
              }}
              onClear={onClearAoi}
            />

            <Separator />

            <WaterwaysSection
              map={map}
              onResult={onWaterwaysResult}
            />

            <Separator />

            <ComputeSection
              map={map}
              pyodideReady={pyodideStatus === 'ready'}
              waterwayGraph={waterwayGraph}
              selectedFloodSource={selectedFloodSource}
              onResult={(data) => {
                onComputeResult(data);
                onOpenChange(false);
              }}
            />

            <Separator />

            {computeResult && (
              <>
                <ResultsSection
                  nodesCount={computeResult.nodesCount}
                  edgesCount={computeResult.edgesCount}
                  componentsCount={computeResult.componentsCount}
                />
                <Separator />
              </>
            )}

            <OfflinePackSection />
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
