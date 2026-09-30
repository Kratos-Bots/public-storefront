import { createContext, createElement, useContext, type ReactNode } from 'react';

export type PreviewAs = { session: 'signed-out' | 'signed-in' | 'signed-in-orders'; cart: 'empty' | 'items' };
export interface BuilderMode { editing: boolean; previewAs: PreviewAs | null }

const SHOPPER: BuilderMode = { editing: false, previewAs: null };
const BuilderModeContext = createContext<BuilderMode>(SHOPPER);

/** The editor (Plan 3) wraps its canvas in this; shoppers never see it. (.ts, so no JSX.) */
export function BuilderModeProvider({ value, children }: { value: BuilderMode; children: ReactNode }) {
  return createElement(BuilderModeContext.Provider, { value }, children);
}

export function useBuilderMode(): BuilderMode {
  return useContext(BuilderModeContext);
}
