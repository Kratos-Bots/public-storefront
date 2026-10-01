import { useEffect, useState } from 'react';
import type { Plugin } from '@puckeditor/core';
import { TextIcon } from '@/builder/editor/icons.tsx';
import { WIDE_FRAME_QUERY } from '@/builder/editor/panels.ts';
import { useTextUi } from '@/builder/editor/text/ui-store.ts';
import { TextPanel } from '@/builder/editor/text/TextPanel.tsx';

/** Whether the frame is at least WIDE_FRAME_PX: the Text panel is a sidebar tab there, else an overlay. */
export function useWideFrame(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia?.(WIDE_FRAME_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_FRAME_QUERY);
    if (!query) return;
    const onChange = () => setWide(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/**
 * Puck mounts every plugin tab's body all the time (hidden by CSS). The panel mounts only while it
 * is the open, wide-frame panel, so there is never a second, hidden copy (narrow frames use
 * TextOverlay instead).
 */
function TextPluginBody() {
  const open = useTextUi((s) => s.open);
  const wide = useWideFrame();
  return open && wide ? <TextPanel /> : <></>;
}

/**
 * The Text panel as a left-sidebar tab (spec §7.2): Blocks and Outline come back when it closes.
 * Labelled "Site text" so the rail item never shares a name with the header's "Text" button.
 */
export const TEXT_PLUGIN: Plugin = { name: 'text', label: 'Site text', icon: <TextIcon />, render: () => <TextPluginBody /> };
