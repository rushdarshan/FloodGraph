import { memo } from 'react';
import type { LegendType } from './sidebar/ComputeSection';

interface MapLegendProps {
  legend: NonNullable<LegendType>;
}

const base =
  'absolute bottom-20 right-3 md:bottom-24 md:right-4 z-10 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2.5 border border-border shadow-md text-sm w-[min(200px,calc(100vw-1.5rem))]';

// Color-blind-safe network connectivity palette (Viridis-inspired)
const networkColors = [
  { name: '1', color: 'var(--connectivity-1)' },
  { name: '2', color: 'var(--connectivity-2)' },
  { name: '3', color: 'var(--connectivity-3)' },
  { name: '4', color: 'var(--connectivity-4)' },
  { name: '5', color: 'var(--connectivity-5)' },
  { name: '6', color: 'var(--connectivity-6)' },
];

function MapLegendComponent({ legend }: MapLegendProps) {
  if (legend === 'connectivity') {
    return (
      <div className={base}>
        <p className="font-semibold mb-2 text-foreground">Connected Waterway Networks</p>
        <div className="grid grid-cols-2 gap-2">
          {networkColors.map(({ name, color }) => (
            <div key={name} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-muted-foreground break-words">Network {name}</span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 text-sm break-words">Each network is a separate drainage system.</p>
      </div>
    );
  }

  if (legend === 'risk') {
    return (
      <div className={base}>
        <p className="font-semibold mb-2 text-foreground">Flood Risk Assessment</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: 'var(--risk-low)' }} />
            <span className="text-sm text-muted-foreground break-words">Low risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: 'var(--risk-medium)' }} />
            <span className="text-sm text-muted-foreground break-words">Medium risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: 'var(--risk-high)' }} />
            <span className="text-sm text-muted-foreground break-words">High risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: 'var(--risk-critical)' }} />
            <span className="text-sm text-muted-foreground break-words">Critical risk</span>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-sm break-words">Shows how likely each section is to flood from the selected source.</p>
      </div>
    );
  }

  if (legend === 'critical') {
    return (
      <div className={base}>
        <p className="font-semibold mb-2 text-foreground">Vulnerable Infrastructure</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--risk-high)' }} />
            <span className="text-sm text-muted-foreground break-words">Critical junction</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 rounded flex-shrink-0" style={{ backgroundColor: 'var(--risk-high)' }} />
            <span className="text-sm text-muted-foreground break-words">Critical channel</span>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-sm break-words">If blocked, these can disrupt downstream water flow.</p>
      </div>
    );
  }

  if (legend === 'flood' || legend === 'animated') {
    return (
      <div className={base}>
        <p className="font-semibold mb-2 text-foreground">Flood Propagation</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--risk-critical)' }} />
            <span className="text-sm text-muted-foreground break-words">Active flood front</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--risk-high)' }} />
            <span className="text-sm text-muted-foreground break-words">Already flooded</span>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-sm break-words">Use this legend while stepping through the flood animation.</p>
      </div>
    );
  }

  return null;
}

export const MapLegend = memo(MapLegendComponent);
