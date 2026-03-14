import { AppState } from '../App';
import { AOISection } from './sidebar/AOISection';
import { WaterwaysSection } from './sidebar/WaterwaysSection';
import { ComputeSection } from './sidebar/ComputeSection';
import { OfflinePackSection } from './sidebar/OfflinePackSection';
import { PyodideStatus } from './sidebar/PyodideStatus';
import { ResultsSection } from './sidebar/ResultsSection';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';

interface SidebarProps {
  appState: AppState;
  setAppState: (state: AppState | ((prev: AppState) => AppState)) => void;
}

export function Sidebar({ appState, setAppState }: SidebarProps) {
  return (
    <aside 
      className="w-80 border-r border-border bg-card shadow-sm flex flex-col h-full"
      role="complementary"
      aria-label="Control panel"
    >
      <ScrollArea className="flex-1 h-0">
        <div className="p-4 space-y-4">
          {/* Pyodide Status Banner */}
          <PyodideStatus 
            status={appState.pyodideStatus}
            progress={appState.pyodideProgress}
          />
          
          <Separator />
          
          {/* Area of Interest */}
          <AOISection 
            status={appState.aoiStatus}
            vertices={appState.aoiVertices}
            onStartDrawing={() => setAppState(prev => ({ ...prev, aoiStatus: 'drawing' }))}
            onClear={() => setAppState(prev => ({ 
              ...prev, 
              aoiStatus: 'idle', 
              aoiVertices: 0,
              waterwaysLoaded: false,
              computeStatus: 'idle'
            }))}
          />
          
          <Separator />
          
          {/* Kerala Waterways */}
          <WaterwaysSection 
            loaded={appState.waterwaysLoaded}
            count={appState.waterwaysCount}
            aoiComplete={appState.aoiStatus === 'complete'}
            onFetch={() => {
              setAppState(prev => ({ ...prev, waterwaysLoaded: true, waterwaysCount: 1247 }));
            }}
          />
          
          <Separator />
          
          {/* Graph Compute */}
          <ComputeSection 
            status={appState.computeStatus}
            progress={appState.computeProgress}
            pyodideReady={appState.pyodideStatus === 'ready'}
            aoiComplete={appState.aoiStatus === 'complete'}
            onRunConnectivity={() => {
              setAppState(prev => ({ ...prev, computeStatus: 'running', computeProgress: 0 }));
              // Simulate computation
              let progress = 0;
              const interval = setInterval(() => {
                progress += 10;
                if (progress >= 100) {
                  clearInterval(interval);
                  setAppState(prev => ({ 
                    ...prev, 
                    computeStatus: 'complete', 
                    computeProgress: 100,
                    nodesCount: 3421,
                    edgesCount: 5683,
                    componentsCount: 12
                  }));
                } else {
                  setAppState(prev => ({ ...prev, computeProgress: progress }));
                }
              }, 300);
            }}
            onRunFloodBFS={() => {
              setAppState(prev => ({ ...prev, computeStatus: 'running', computeProgress: 0 }));
              // Simulate computation
              let progress = 0;
              const interval = setInterval(() => {
                progress += 15;
                if (progress >= 100) {
                  clearInterval(interval);
                  setAppState(prev => ({ 
                    ...prev, 
                    computeStatus: 'complete', 
                    computeProgress: 100 
                  }));
                } else {
                  setAppState(prev => ({ ...prev, computeProgress: progress }));
                }
              }, 400);
            }}
          />
          
          <Separator />
          
          {/* Results */}
          {appState.computeStatus === 'complete' && (
            <>
              <ResultsSection 
                nodesCount={appState.nodesCount}
                edgesCount={appState.edgesCount}
                componentsCount={appState.componentsCount}
              />
              <Separator />
            </>
          )}
          
          {/* Offline Pack */}
          <OfflinePackSection 
            status={appState.offlinePackStatus}
            progress={appState.offlinePackProgress}
            error={appState.offlinePackError}
            onDownload={() => {
              setAppState(prev => ({ ...prev, offlinePackStatus: 'downloading', offlinePackProgress: 0 }));
              // Simulate download
              let progress = 0;
              const interval = setInterval(() => {
                progress += 20;
                if (progress >= 100) {
                  clearInterval(interval);
                  setAppState(prev => ({ 
                    ...prev, 
                    offlinePackStatus: 'cached', 
                    offlinePackProgress: 100 
                  }));
                } else {
                  setAppState(prev => ({ ...prev, offlinePackProgress: progress }));
                }
              }, 500);
            }}
          />
        </div>
      </ScrollArea>
      
      {/* Footer */}
      <div className="p-3 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          © 2026 Darshan K · MIT License
        </p>
        <p className="text-xs text-muted-foreground text-center mt-1">
          FloodGraph v0.1.0
        </p>
      </div>
    </aside>
  );
}