import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { EditorBlock } from '@/builder/editor/EditorBlock.tsx';

afterEach(cleanup);

const empty = defineBlock<{ id: string }>({
  name: 'Quiet', label: 'Quiet', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  style: { target: 'wrap', keys: ['bg', 'padTop'] }, schema: z.object({}), defaultProps: {}, render: () => null,
});

describe('EditorBlock · styles', () => {
  it('a styled wrap block that renders nothing still gets the canvas placeholder', () => {
    const { container } = render(<EditorBlock def={empty} props={{ id: 'q', blockStyle: { bg: 'surface', padTop: 'xl' } }} docKey="catalog" layout="storefront" />);
    expect(container.querySelector('[data-sf-style="Quiet"]')).not.toBeNull();
    expect(container.querySelector('[data-sf-builder-empty]')).not.toBeNull();
  });
  it('hide renders as a ghost, never a real hide, on the canvas', () => {
    const shown = defineBlock<{ id: string }>({ ...empty, name: 'Shown', style: { target: 'root', keys: ['hide'] }, render: ({ puck }) => <p data-sf-block="Shown" {...puck.style}>x</p> });
    const { container } = render(<EditorBlock def={shown} props={{ id: 's', blockStyle: { hide: 'mobile' } }} docKey="catalog" layout="storefront" />);
    const p = container.querySelector('[data-sf-block="Shown"]')!;
    expect(p.getAttribute('data-sfs-ghost')).toBe('mobile');
    expect(p.hasAttribute('data-sfs-hide')).toBe(false);
  });
});
