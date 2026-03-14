import { useState } from 'react';
import { MapView } from './components/MapView';
import { Sidebar } from './components/Sidebar';
import { MobileDrawer } from './components/MobileDrawer';
import { Header } from './components/Header';
import { Toaster } from './components/ui/sonner';
import { useIsMobile } from './components/ui/use-mobile';

export interface AppState {
  // Pyodide Worker Status
  pyodideStatus: 'loading' | 'ready' | 'error';
  pyodideProgress: number;
  
  // AOI Drawing
  aoiStatus: 'idle' | 'drawing' | 'complete';
  aoiVertices: number;
  
  // Kerala Waterways
  waterwaysLoaded: boolean;
  waterwaysCount: number;
  
  // Graph Computation
  computeStatus: 'idle' | 'running' | 'complete' | 'error';
  computeProgress: number;
  
  // Results
  nodesCount: number;
  edgesCount: number;
  componentsCount: number;
  
  // Offline Map Pack
  offlinePackStatus: 'idle' | 'downloading' | 'cached' | 'error';
  offlinePackProgress: number;
  offlinePackError?: string;
}

export default function App() {
  const [appState, setAppState] = useState<AppState>({
    pyodideStatus: 'loading',
    pyodideProgress: 0,
    aoiStatus: 'idle',
    aoiVertices: 0,
    waterwaysLoaded: false,
    waterwaysCount: 0,
    computeStatus: 'idle',
    computeProgress: 0,
    nodesCount: 0,
    edgesCount: 0,
    componentsCount: 0,
    offlinePackStatus: 'idle',
    offlinePackProgress: 0
  });

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <Header 
        onMenuClick={() => setIsMobileDrawerOpen(true)}
        showMenuButton={isMobile}
      />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        {!isMobile && <Sidebar appState={appState} setAppState={setAppState} />}

        {/* Main Map Area */}
        <MapView appState={appState} setAppState={setAppState} />
      </div>

      {/* Mobile Drawer */}
      {isMobile && (
        <MobileDrawer
          open={isMobileDrawerOpen}
          onOpenChange={setIsMobileDrawerOpen}
          appState={appState}
          setAppState={setAppState}
        />
      )}

      <Toaster />
    </div>
  );
}