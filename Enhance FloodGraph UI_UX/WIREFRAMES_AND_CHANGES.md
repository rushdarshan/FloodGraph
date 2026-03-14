# FloodGraph UI Wireframes & Specific Code Changes

## 📐 Wireframe Descriptions

### Desktop Layout (≥768px)

```
┌─────────────────────────────────────────────────────────────────────┐
│  [≡] NeerNet - FloodGraph                    [●] Online          │
│                                                                     │
├────────────┬────────────────────────────────────────────────────────┤
│            │                                                        │
│  Pyodide   │                                                        │
│  [████▌···]│                                                        │
│  Loading   │                                                        │
│            │              MAP VIEW                                  │
│ ┌────────┐ │          (MapLibre GL)                                 │
│ │ AOI    │ │                                                        │
│ │ [Draw] │ │        [Click to add vertices]                         │
│ └────────┘ │        Double-click to finish                          │
│            │                                                        │
│ ┌────────┐ │                                                        │
│ │Kerala  │ │                     Kerala                             │
│ │Water   │ │                    Region                              │
│ │[Fetch] │ │                                                        │
│ └────────┘ │                                                        │
│            │                                                        │
│ ┌────────┐ │                                                        │
│ │Compute │ │                                                        │
│ │[Run]   │ │                                                        │
│ └────────┘ │                                                        │
│            │                                                        │
│ ┌────────┐ │    [+] [-] [⟲]  Zoom/Rotate                            │
│ │Offline │ │                                                        │
│ │[Down]  │ │                                                        │
│ └────────┘ │                                                        │
│            │                                                        │
│ v0.1.0    │    © OpenStreetMap contributors                         │
└────────────┴────────────────────────────────────────────────────────┘
```

### Mobile Layout (<768px)

```
┌──────────────────────┐
│ [≡] NeerNet   [●]   │
├──────────────────────┤
│                      │
│                      │
│                      │
│                      │
│     MAP VIEW         │
│   (Full Screen)      │
│                      │
│     Kerala           │
│                      │
│                      │
│                      │
│                      │
│  [+] [-] [⟲]        │
│                      │
│  © OpenStreetMap    │
└──────────────────────┘
        ▲ 
  Swipe up for controls
  
When drawer open:
┌──────────────────────┐
│ [≡] NeerNet   [●]   │
├──────────────────────┤
│                      │
│  Dimmed Map          │
│                      │
╞══════════════════════╡
│ Controls  [×]        │
├──────────────────────┤
│ ┌──────────────────┐ │
│ │ Pyodide Loading  │ │
│ │ [████▌·······]   │ │
│ └──────────────────┘ │
│                      │
│ ┌──────────────────┐ │
│ │ AOI [Draw]       │ │
│ └──────────────────┘ │
│                      │
│ ┌──────────────────┐ │
│ │ Waterways[Fetch] │ │
│ └──────────────────┘ │
│                      │
│   (scroll for more)  │
└──────────────────────┘
```

### Component States

#### 1. AOI Section States

**Idle State:**
```
┌────────────────────────┐
│ 🖊 Area of Interest    │
│ Draw polygon on map    │
├────────────────────────┤
│                        │
│  ┌──────────────────┐  │
│  │ 🖊 Draw AOI      │  │
│  │    Polygon       │  │
│  └──────────────────┘  │
│                        │
└────────────────────────┘
```

**Drawing State:**
```
┌────────────────────────┐
│ 🖊 Area of Interest    │
│ Draw polygon on map    │
├────────────────────────┤
│  ⚡ Drawing Active      │
│  Click: add vertices   │
│  (3 vertices added)    │
│  Double-click: finish  │
└────────────────────────┘
```

**Complete State:**
```
┌────────────────────────┐
│ 🖊 Area of Interest    │
│ Draw polygon on map    │
├────────────────────────┤
│  ✓ AOI Complete        │
│  5 vertices defined    │
│                        │
│  ┌──────────────────┐  │
│  │ 🗑 Clear AOI     │  │
│  └──────────────────┘  │
└────────────────────────┘
```

#### 2. Pyodide Status States

**Loading:**
```
┌────────────────────────┐
│ ⌛ Loading Pyodide     │
│ Initializing Python... │
│ [████████▌·········] 75%│
└────────────────────────┘
```

**Ready:**
```
┌────────────────────────┐
│ ✓ Pyodide Ready        │
│ Python runtime loaded  │
└────────────────────────┘
```

**Error:**
```
┌────────────────────────┐
│ ⚠ Pyodide Error        │
│ Failed to load runtime │
│ Please refresh page    │
└────────────────────────┘
```

#### 3. Compute Section States

**Disabled (Prerequisites not met):**
```
┌────────────────────────┐
│ ⚙ Graph Compute        │
│ Run algorithms         │
├────────────────────────┤
│  ⚠ Prerequisites:      │
│  • Pyodide loading...  │
│  • Complete AOI first  │
│                        │
│  ┌──────────────────┐  │
│  │ ▶ Run Connectivity│  │  [Disabled]
│  └──────────────────┘  │
│  ┌──────────────────┐  │
│  │ ▶ Run Flood BFS  │  │  [Disabled]
│  └──────────────────┘  │
└────────────────────────┘
```

**Ready:**
```
┌────────────────────────┐
│ ⚙ Graph Compute        │
│ Run algorithms         │
├────────────────────────┤
│  ┌──────────────────┐  │
│  │ ▶ Run Connectivity│  │  [Active]
│  └──────────────────┘  │
│  ┌──────────────────┐  │
│  │ ▶ Run Flood BFS  │  │  [Active]
│  └──────────────────┘  │
└────────────────────────┘
```

**Running:**
```
┌────────────────────────┐
│ ⚙ Graph Compute        │
│ Run algorithms         │
├────────────────────────┤
│  ⌛ Computing...       │
│  [██████▌··········] 65%│
└────────────────────────┘
```

**Complete:**
```
┌────────────────────────┐
│ ⚙ Graph Compute        │
│ Run algorithms         │
├────────────────────────┤
│  ✓ Computation complete│
│                        │
│  ┌──────────────────┐  │
│  │ 📊 Results       │  │
│  │ Nodes: 3,421     │  │
│  │ Edges: 5,683     │  │
│  │ Components: 12   │  │
│  └──────────────────┘  │
└────────────────────────┘
```

---

## 🔧 Specific Code Changes for Your Project

### File: `index.html`

**Change 1: Add Responsive Meta Tag**
```html
<!-- ADD THIS in <head> -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

**Change 2: Restructure Body**
```html
<!-- REPLACE entire body with: -->
<body>
  <div id="app" class="app-container">
    <!-- Header -->
    <header id="app-header" class="header">
      <button id="menu-toggle" class="menu-button" aria-label="Toggle sidebar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
      
      <div class="header-title">
        <svg class="logo-icon" width="24" height="24"><!-- wave icon --></svg>
        <div>
          <h1 class="title">NeerNet</h1>
          <p class="subtitle">FloodGraph - Offline Simulator</p>
        </div>
      </div>
      
      <div id="status-badge" class="status-badge online">
        <svg width="16" height="16"><!-- wifi icon --></svg>
        <span>Online</span>
      </div>
    </header>

    <!-- Main Content -->
    <div class="main-container">
      <!-- Sidebar -->
      <aside id="sidebar" class="sidebar" role="complementary" aria-label="Control panel">
        <div class="sidebar-content" id="sidebar-content">
          <!-- Sections will be injected here -->
        </div>
        <footer class="sidebar-footer">
          <p>© 2026 Darshan K · MIT License</p>
          <p>FloodGraph v0.1.0</p>
        </footer>
      </aside>

      <!-- Map -->
      <main id="map-container" class="map-container" role="main" aria-label="Map view">
        <!-- Map loads here -->
        <div id="map-overlay" class="map-overlay">
          <div class="loader"></div>
          <p>Loading map...</p>
        </div>
      </main>
    </div>
  </div>
  
  <!-- Scripts -->
  <script type="module" src="/src/main.ts"></script>
</body>
```

---

### File: `src/styles/main.css`

**Create a new comprehensive stylesheet:**

```css
/* ==========================
   CSS VARIABLES
   ========================== */
:root {
  /* Layout */
  --sidebar-width: 320px;
  --header-height: 56px;
  
  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  
  /* Colors - Light Mode */
  --color-background: #ffffff;
  --color-foreground: #0a0a0a;
  --color-card: #ffffff;
  --color-border: #e4e4e7;
  --color-muted: #f4f4f5;
  --color-muted-foreground: #71717a;
  
  --color-primary: #3b82f6;
  --color-primary-foreground: #ffffff;
  
  --color-success: #10b981;
  --color-success-bg: #d1fae5;
  --color-error: #ef4444;
  --color-error-bg: #fee2e2;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  
  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 350ms ease;
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #09090b;
    --color-foreground: #fafafa;
    --color-card: #18181b;
    --color-border: #27272a;
    --color-muted: #27272a;
    --color-muted-foreground: #a1a1aa;
    
    --color-success-bg: #065f46;
    --color-error-bg: #7f1d1d;
  }
}

/* ==========================
   RESET & BASE
   ========================== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  color: var(--color-foreground);
  background: var(--color-background);
  line-height: 1.5;
}

/* ==========================
   LAYOUT
   ========================== */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-md);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-card);
  box-shadow: var(--shadow-sm);
}

.main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-card);
  box-shadow: var(--shadow-sm);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
}

.sidebar-footer {
  padding: var(--space-md);
  border-top: 1px solid var(--color-border);
  background: var(--color-muted);
  text-align: center;
  font-size: 0.75rem;
  color: var(--color-muted-foreground);
}

.map-container {
  flex: 1;
  position: relative;
}

/* ==========================
   HEADER
   ========================== */
.menu-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  transition: background var(--transition-fast);
}

.menu-button:hover {
  background: var(--color-muted);
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  margin-left: var(--space-md);
}

.logo-icon {
  color: var(--color-primary);
}

.title {
  font-size: 1rem;
  font-weight: 600;
}

.subtitle {
  font-size: 0.75rem;
  color: var(--color-muted-foreground);
  display: none;
}

@media (min-width: 640px) {
  .subtitle {
    display: block;
  }
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  background: var(--color-success-bg);
  color: var(--color-success);
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.offline {
  background: var(--color-muted);
  color: var(--color-muted-foreground);
}

/* ==========================
   CARD COMPONENT
   ========================== */
.card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: var(--space-md);
  box-shadow: var(--shadow-sm);
}

.card-header {
  padding: var(--space-md);
  padding-bottom: var(--space-sm);
}

.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: var(--space-xs);
}

.card-description {
  font-size: 0.75rem;
  color: var(--color-muted-foreground);
}

.card-content {
  padding: 0 var(--space-md) var(--space-md);
}

/* ==========================
   BUTTON COMPONENT
   ========================== */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
  min-height: 44px; /* Touch-friendly */
}

.button-primary {
  background: var(--color-primary);
  color: var(--color-primary-foreground);
}

.button-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.button-outline {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-foreground);
}

.button-outline:hover:not(:disabled) {
  background: var(--color-muted);
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-full {
  width: 100%;
}

/* ==========================
   PROGRESS BAR
   ========================== */
.progress-container {
  width: 100%;
  height: 8px;
  background: var(--color-muted);
  border-radius: 4px;
  overflow: hidden;
  margin: var(--space-sm) 0;
}

.progress-bar {
  height: 100%;
  background: var(--color-primary);
  transition: width var(--transition-base);
}

/* ==========================
   ALERT COMPONENT
   ========================== */
.alert {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-radius: 6px;
  border: 1px solid var(--color-border);
  margin-bottom: var(--space-md);
}

.alert-success {
  background: var(--color-success-bg);
  border-color: var(--color-success);
  color: var(--color-success);
}

.alert-error {
  background: var(--color-error-bg);
  border-color: var(--color-error);
  color: var(--color-error);
}

.alert-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.alert-content {
  flex: 1;
}

.alert-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: var(--space-xs);
}

.alert-description {
  font-size: 0.75rem;
  opacity: 0.9;
}

/* ==========================
   MAP OVERLAY
   ========================== */
.map-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  z-index: 1000;
}

@media (prefers-color-scheme: dark) {
  .map-overlay {
    background: rgba(0, 0, 0, 0.9);
  }
}

.map-overlay.hidden {
  display: none;
}

.loader {
  width: 48px;
  height: 48px;
  border: 4px solid var(--color-muted);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ==========================
   RESPONSIVE
   ========================== */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: auto;
    max-height: 85vh;
    border-right: none;
    border-top: 1px solid var(--color-border);
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    transform: translateY(100%);
    transition: transform var(--transition-base);
    z-index: 50;
    box-shadow: var(--shadow-lg);
  }
  
  .sidebar.open {
    transform: translateY(0);
  }
  
  .sidebar-content {
    max-height: calc(85vh - 120px);
  }
}

/* ==========================
   UTILITY CLASSES
   ========================== */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.separator {
  height: 1px;
  background: var(--color-border);
  margin: var(--space-md) 0;
}
```

---

### File: `src/main.ts`

**Complete refactor with modular structure:**

```typescript
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/main.css';

// ==========================
// STATE MANAGEMENT
// ==========================
interface AppState {
  // AOI
  aoiStatus: 'idle' | 'drawing' | 'complete';
  aoiVertices: number;
  
  // Pyodide
  pyodideStatus: 'loading' | 'ready' | 'error';
  pyodideProgress: number;
  
  // Waterways
  waterwaysLoaded: boolean;
  waterwaysCount: number;
  
  // Compute
  computeStatus: 'idle' | 'running' | 'complete' | 'error';
  computeProgress: number;
  
  // Results
  nodesCount: number;
  edgesCount: number;
  componentsCount: number;
  
  // Offline
  offlinePackStatus: 'idle' | 'downloading' | 'cached' | 'error';
  offlinePackProgress: number;
}

class StateManager {
  private state: AppState = {
    aoiStatus: 'idle',
    aoiVertices: 0,
    pyodideStatus: 'loading',
    pyodideProgress: 0,
    waterwaysLoaded: false,
    waterwaysCount: 0,
    computeStatus: 'idle',
    computeProgress: 0,
    nodesCount: 0,
    edgesCount: 0,
    componentsCount: 0,
    offlinePackStatus: 'idle',
    offlinePackProgress: 0,
  };
  
  private listeners = new Set<(state: AppState) => void>();
  
  get current() {
    return this.state;
  }
  
  update(partial: Partial<AppState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }
  
  subscribe(listener: (state: AppState) => void) {
    this.listeners.add(listener);
    listener(this.state); // Initial call
    return () => this.listeners.delete(listener);
  }
  
  private notify() {
    this.listeners.forEach(fn => fn(this.state));
  }
}

// ==========================
// SIDEBAR RENDERER
// ==========================
class SidebarRenderer {
  constructor(
    private container: HTMLElement,
    private state: StateManager,
    private actions: AppActions
  ) {}
  
  render() {
    const s = this.state.current;
    
    this.container.innerHTML = `
      ${this.renderPyodideStatus(s)}
      <div class="separator"></div>
      ${this.renderAOISection(s)}
      <div class="separator"></div>
      ${this.renderWaterwaysSection(s)}
      <div class="separator"></div>
      ${this.renderComputeSection(s)}
      ${s.computeStatus === 'complete' ? `
        <div class="separator"></div>
        ${this.renderResultsSection(s)}
      ` : ''}
      <div class="separator"></div>
      ${this.renderOfflineSection(s)}
    `;
    
    this.attachEventListeners();
  }
  
  private renderPyodideStatus(s: AppState) {
    if (s.pyodideStatus === 'ready') {
      return `
        <div class="alert alert-success">
          <svg class="alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          <div class="alert-content">
            <div class="alert-title">Pyodide Ready</div>
            <div class="alert-description">Python runtime loaded</div>
          </div>
        </div>
      `;
    }
    
    return `
      <div class="alert">
        <div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div>
        <div class="alert-content">
          <div class="alert-title">Loading Pyodide</div>
          <div class="alert-description">
            Initializing Python runtime...
            <div class="progress-container">
              <div class="progress-bar" style="width: ${s.pyodideProgress}%"></div>
            </div>
            <small>${s.pyodideProgress}%</small>
          </div>
        </div>
      </div>
    `;
  }
  
  private renderAOISection(s: AppState) {
    const content = s.aoiStatus === 'idle' ? `
      <button class="button button-primary button-full" id="start-drawing">
        Draw AOI Polygon
      </button>
    ` : s.aoiStatus === 'drawing' ? `
      <div class="alert">
        <div class="alert-content">
          <div class="alert-title">Drawing Active</div>
          <div class="alert-description">
            Click to add vertices (${s.aoiVertices} added)<br>
            Double-click to finish
          </div>
        </div>
      </div>
    ` : `
      <div class="alert alert-success">
        <div class="alert-content">
          <div class="alert-title">AOI Complete</div>
          <div class="alert-description">${s.aoiVertices} vertices defined</div>
        </div>
      </div>
      <button class="button button-outline button-full" id="clear-aoi">
        Clear AOI
      </button>
    `;
    
    return `
      <section class="card">
        <div class="card-header">
          <div class="card-title">Area of Interest (AOI)</div>
          <div class="card-description">Draw polygon on map</div>
        </div>
        <div class="card-content">
          ${content}
        </div>
      </section>
    `;
  }
  
  private renderWaterwaysSection(s: AppState) {
    const canFetch = s.aoiStatus === 'complete';
    
    const content = !canFetch ? `
      <div class="alert">
        <div class="alert-description">Complete AOI first</div>
      </div>
    ` : s.waterwaysLoaded ? `
      <div class="alert alert-success">
        <div class="alert-content">
          <div class="alert-title">Data Loaded</div>
          <div class="alert-description">
            ${s.waterwaysCount.toLocaleString()} waterways
          </div>
        </div>
      </div>
    ` : `
      <button class="button button-primary button-full" id="fetch-waterways">
        Fetch Kerala Waterways
      </button>
    `;
    
    return `
      <section class="card">
        <div class="card-header">
          <div class="card-title">Kerala Waterways</div>
          <div class="card-description">Fetch OSM data</div>
        </div>
        <div class="card-content">
          ${content}
        </div>
      </section>
    `;
  }
  
  private renderComputeSection(s: AppState) {
    const canRun = s.pyodideStatus === 'ready' && s.aoiStatus === 'complete';
    
    const content = !canRun ? `
      <div class="alert">
        <div class="alert-description">
          ${s.pyodideStatus !== 'ready' ? 'Waiting for Pyodide...' : 'Complete AOI first'}
        </div>
      </div>
    ` : s.computeStatus === 'running' ? `
      <div class="alert">
        <div class="alert-description">
          Computing...
          <div class="progress-container">
            <div class="progress-bar" style="width: ${s.computeProgress}%"></div>
          </div>
          <small>${s.computeProgress}%</small>
        </div>
      </div>
    ` : `
      <button class="button button-primary button-full" id="run-connectivity">
        Run Connectivity
      </button>
      <button class="button button-outline button-full" id="run-flood-bfs" style="margin-top: 0.5rem;">
        Run Flood BFS
      </button>
    `;
    
    return `
      <section class="card">
        <div class="card-header">
          <div class="card-title">Graph Compute (Pyodide)</div>
          <div class="card-description">Run algorithms in-browser</div>
        </div>
        <div class="card-content">
          ${content}
        </div>
      </section>
    `;
  }
  
  private renderResultsSection(s: AppState) {
    return `
      <section class="card">
        <div class="card-header">
          <div class="card-title">Computation Results</div>
        </div>
        <div class="card-content">
          <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--color-muted); border-radius: 6px; margin-bottom: 0.5rem;">
            <span>Nodes</span>
            <strong>${s.nodesCount.toLocaleString()}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--color-muted); border-radius: 6px; margin-bottom: 0.5rem;">
            <span>Edges</span>
            <strong>${s.edgesCount.toLocaleString()}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--color-muted); border-radius: 6px;">
            <span>Components</span>
            <strong>${s.componentsCount}</strong>
          </div>
        </div>
      </section>
    `;
  }
  
  private renderOfflineSection(s: AppState) {
    const content = s.offlinePackStatus === 'idle' ? `
      <button class="button button-outline button-full" id="download-pack">
        Download Offline Pack
      </button>
    ` : s.offlinePackStatus === 'downloading' ? `
      <div class="alert">
        <div class="alert-description">
          Downloading tiles...
          <div class="progress-container">
            <div class="progress-bar" style="width: ${s.offlinePackProgress}%"></div>
          </div>
          <small>${s.offlinePackProgress}%</small>
        </div>
      </div>
    ` : `
      <div class="alert alert-success">
        <div class="alert-description">Offline pack cached</div>
      </div>
    `;
    
    return `
      <section class="card">
        <div class="card-header">
          <div class="card-title">Offline Packs</div>
          <div class="card-description">Download tiles for offline use</div>
        </div>
        <div class="card-content">
          ${content}
        </div>
      </section>
    `;
  }
  
  private attachEventListeners() {
    const addListener = (id: string, handler: () => void) => {
      this.container.querySelector(`#${id}`)?.addEventListener('click', handler);
    };
    
    addListener('start-drawing', () => this.actions.startDrawing());
    addListener('clear-aoi', () => this.actions.clearAOI());
    addListener('fetch-waterways', () => this.actions.fetchWaterways());
    addListener('run-connectivity', () => this.actions.runConnectivity());
    addListener('run-flood-bfs', () => this.actions.runFloodBFS());
    addListener('download-pack', () => this.actions.downloadPack());
  }
}

// ==========================
// ACTIONS
// ==========================
class AppActions {
  constructor(
    private state: StateManager,
    private map: maplibregl.Map
  ) {}
  
  startDrawing() {
    this.state.update({ aoiStatus: 'drawing', aoiVertices: 0 });
    this.map.getCanvas().style.cursor = 'crosshair';
    // Add drawing handlers
  }
  
  clearAOI() {
    this.state.update({ aoiStatus: 'idle', aoiVertices: 0, waterwaysLoaded: false });
    this.map.getCanvas().style.cursor = '';
  }
  
  fetchWaterways() {
    // Simulate fetch
    this.state.update({ waterwaysLoaded: true, waterwaysCount: 1247 });
  }
  
  runConnectivity() {
    this.state.update({ computeStatus: 'running', computeProgress: 0 });
    this.simulateProgress('computeProgress', () => {
      this.state.update({
        computeStatus: 'complete',
        nodesCount: 3421,
        edgesCount: 5683,
        componentsCount: 12
      });
    });
  }
  
  runFloodBFS() {
    this.state.update({ computeStatus: 'running', computeProgress: 0 });
    this.simulateProgress('computeProgress', () => {
      this.state.update({ computeStatus: 'complete' });
    });
  }
  
  downloadPack() {
    this.state.update({ offlinePackStatus: 'downloading', offlinePackProgress: 0 });
    this.simulateProgress('offlinePackProgress', () => {
      this.state.update({ offlinePackStatus: 'cached' });
    });
  }
  
  private simulateProgress(key: keyof AppState, onComplete: () => void) {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        clearInterval(interval);
        onComplete();
      } else {
        this.state.update({ [key]: progress } as any);
      }
    }, 300);
  }
}

// ==========================
// INITIALIZATION
// ==========================
function init() {
  // State
  const state = new StateManager();
  
  // Map
  const map = new maplibregl.Map({
    container: 'map-container',
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
        }
      },
      layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm-tiles' }]
    },
    center: [76.2711, 10.8505],
    zoom: 7
  });
  
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  
  map.on('load', () => {
    document.getElementById('map-overlay')?.classList.add('hidden');
    
    // Simulate Pyodide loading
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      state.update({ pyodideProgress: progress });
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => state.update({ pyodideStatus: 'ready' }), 500);
      }
    }, 400);
  });
  
  // Actions
  const actions = new AppActions(state, map);
  
  // Sidebar
  const sidebarContent = document.getElementById('sidebar-content')!;
  const sidebar = new SidebarRenderer(sidebarContent, state, actions);
  
  state.subscribe(() => {
    sidebar.render();
  });
  
  // Responsive menu toggle
  const menuToggle = document.getElementById('menu-toggle');
  const sidebarEl = document.getElementById('sidebar');
  
  menuToggle?.addEventListener('click', () => {
    sidebarEl?.classList.toggle('open');
  });
  
  // Close on mobile after action
  const mq = window.matchMedia('(max-width: 768px)');
  if (mq.matches) {
    sidebarContent.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('button')) {
        setTimeout(() => sidebarEl?.classList.remove('open'), 300);
      }
    });
  }
}

init();
```

---

## 🚀 Quick Migration Checklist

1. **Backup your current code**
2. **Update index.html** with new structure
3. **Replace/create styles/main.css** with new CSS
4. **Refactor src/main.ts** following the modular pattern
5. **Test on desktop** (≥768px width)
6. **Test on mobile** (<768px width)
7. **Test accessibility** (keyboard navigation, screen reader)
8. **Deploy** and gather user feedback

---

**Summary:** This gives you complete wireframes, exact CSS code, and a fully refactored TypeScript architecture that you can drop into your existing FloodGraph project!
