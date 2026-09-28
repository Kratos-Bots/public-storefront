import type { OverlayProps } from '@/templates/contract.ts';
import { Crosshairs } from './Crosshairs.tsx';

/** A fixed, tap-transparent frame of corner crosshairs around the viewport. */
export function CyberOverlay({ options }: OverlayProps) {
  if (options.crosshairs !== true) return null;
  return (
    <div className="cb-frame" data-cb="frame" aria-hidden>
      <Crosshairs />
    </div>
  );
}
