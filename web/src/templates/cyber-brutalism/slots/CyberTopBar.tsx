import { formatClock, useCatalogStats, useCutoffInfo, useServerClock, utcOffsetLabel, type TopBarProps } from '@/templates/contract.ts';
import { nodeName } from './readout.ts';

function SystemBar({ node }: { node: string }) {
  const now = useServerClock(1000);
  const { timezone } = useCutoffInfo();
  const { productCount } = useCatalogStats();
  return (
    <div className="cb-sysbar" data-cb="sysbar" aria-hidden>
      <span>
        SYS.TIME <span className="cb-sysbar__time">{formatClock(now, timezone)}</span>
        <span data-cb-wide> / {utcOffsetLabel(now, timezone)}</span>
      </span>
      <span className="cb-sysbar__sep">·</span>
      <span>NODE: {node}</span>
      <span className="cb-sysbar__sep" data-cb-wide>·</span>
      <span className="cb-sysbar__end" data-cb-wide>SKU: {productCount ?? '---'}</span>
    </div>
  );
}

/**
 * The live-system strip above the header: the server's clock in the store's cut-off
 * timezone, the node label, the real catalogue size. Decorative for assistive tech
 * (it would announce every second), so the whole strip is aria-hidden.
 */
export function CyberTopBar({ options }: TopBarProps) {
  if (options.systemBar !== true) return null;
  return <SystemBar node={nodeName(options.nodeLabel)} />;
}
