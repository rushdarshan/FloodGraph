import type { LegendType } from './sidebar/ComputeSection';

interface MapLegendProps {
  legend: NonNullable<LegendType>;
}

const base =
  'absolute bottom-24 right-4 z-10 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2.5 border border-border shadow-md text-xs max-w-[180px]';

export function MapLegend({ legend }: MapLegendProps) {
  if (legend === 'connectivity') {
    return (
      <div className={base}>
        <p className="font-semibold mb-2 text-foreground">Connected Networks</p>
        <div className="flex items-center gap-1 flex-wrap">
          {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map((c) => (
            <div key={c} className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: c }} />
          ))}
        </div>
        <p className="text-muted-foreground mt-1.5 text-[10px]">Each colour = one drainage network</p>
      </div>
    );
  }

  if (legend === 'risk') {
    return (
      <div className={base}>
        <p className="font-semibold mb-2">Flood Risk</p>
        <div
          className="w-full h-3 rounded-sm"
          style={{ background: 'linear-gradient(to right, rgb(34,197,94), rgb(239,68,68))' }}
        />
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          <span>Low risk</span>
          <span>High risk</span>
        </div>
      </div>
    );
  }

  if (legend === 'critical') {
    return (
      <div className={base}>
        <p className="font-semibold mb-2">Vulnerable Infrastructure</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-orange-500 flex-shrink-0" />
            <span className="text-muted-foreground text-[10px]">Critical junction</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-orange-500 rounded flex-shrink-0" />
            <span className="text-muted-foreground text-[10px]">Critical channel</span>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-[10px]">Orange = removal disconnects water flow</p>
      </div>
    );
  }

  if (legend === 'flood' || legend === 'animated') {
    return (
      <div className={base}>
        <p className="font-semibold mb-2">Flood Spread</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-muted-foreground text-[10px]">Active flood front</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-900/80 flex-shrink-0" />
            <span className="text-muted-foreground text-[10px]">Already flooded</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
