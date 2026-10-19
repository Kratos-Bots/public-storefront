import { describe, expect, it } from 'vitest';
import { threadItems } from '@/features/support/thread-items.ts';
import type { ThreadDetail, ThreadMessage } from '@/features/support/queries.ts';

const msg = (id: number, at: string, local?: ThreadMessage['local']): ThreadMessage => ({
  id, fromSupport: false, authorLabel: 'You', body: `m${id}`, attachments: [], createdAt: at, ...(local ? { local } : {}),
});

const detail = (messages: ThreadMessage[], timeline: ThreadDetail['timeline']): ThreadDetail => ({
  id: 1, subject: 's', status: 'needs_reply', order: null, canReply: true, reopenUntil: null, createdAt: '2026-10-01T00:00:00Z',
  messages, timeline,
});

const order = (d: ThreadDetail) => threadItems(d).map((i) => (i.kind === 'event' ? i.event.type : i.message.body));

describe('threadItems', () => {
  it('merges events and messages by time; at the same instant opened/reopened lead and closed trails', () => {
    const T1 = '2026-10-01T09:00:00Z';
    const T2 = '2026-10-02T09:00:00Z';
    const T3 = '2026-10-03T09:00:00Z';
    expect(order(detail(
      [msg(1, T1), msg(2, T2), msg(3, T3)],
      [{ type: 'closed', at: T2 }, { type: 'reopened', at: T3 }, { type: 'opened', at: T1 }],
    ))).toEqual(['opened', 'm1', 'm2', 'closed', 'reopened', 'm3']);
  });

  it('puts messages still on their way at the end, whatever their clock says', () => {
    const draft = { body: 'm9', files: [] };
    expect(order(detail(
      [msg(9, '2026-09-01T00:00:00Z', { state: 'sending', draft }), msg(1, '2026-10-01T09:00:00Z')],
      [],
    ))).toEqual(['m1', 'm9']);
  });
});
