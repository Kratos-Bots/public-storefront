import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { NoticeBanners } from '@/features/notices/NoticeBanners.tsx';
import { BOX, styleSupport, VIS } from '@/builder/style/model.ts';

/** The store's notices (Admin → Storefront → Selling). The Header already carries the pinned ones. */
export const block = defineBlock<{ id: string; pinned: boolean }>({
  name: 'NoticeBanners', label: 'Notices', category: 'shell', layouts: 'all', routeBound: false, slots: [],
  style: styleSupport('wrap', [...BOX, ...VIS]),
  text: ['notices.banners.*'],
  schema: z.object({ pinned: z.boolean() }), defaultProps: { pinned: false },
  render: ({ pinned }) => <NoticeBanners pinned={pinned} />,
});
