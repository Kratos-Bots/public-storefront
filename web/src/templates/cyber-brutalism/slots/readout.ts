export const DEFAULT_NODE = 'NODE_01';
export const NODE_MAX = 24;

/** The admin's node label, trimmed and clamped; anything unusable reads as NODE_01. */
export function nodeName(value: boolean | string | undefined): string {
  if (typeof value !== 'string') return DEFAULT_NODE;
  const v = value.trim();
  return v ? v.slice(0, NODE_MAX) : DEFAULT_NODE;
}

import { textSnapshot, type TextApi } from '@/templates/contract.ts';

export interface ReadoutInput { productCount: number | null; cutoff: string | null; accepting: boolean }

/** Terminal readout lines — real store data only, no invented metrics. */
export function readoutLines({ productCount, cutoff, accepting }: ReadoutInput, api: Pick<TextApi, 't'> = textSnapshot()): string[] {
  const { t } = api;
  const lines: string[] = [];
  if (cutoff) lines.push(t('templates.cyber-brutalism.readout.cutoff', { cutoff }));
  lines.push(t('templates.cyber-brutalism.readout.items', { count: productCount ?? '---' }));
  lines.push(accepting ? t('templates.cyber-brutalism.readout.online') : t('templates.cyber-brutalism.readout.paused'));
  return lines;
}
