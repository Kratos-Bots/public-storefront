import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('@/api/client.ts', () => ({
  api: { post: h.post, get: h.get },
  unwrap: async (p: Promise<{ json: () => Promise<{ data: unknown }> }>) => (await (await p).json()).data,
  unwrapWithMeta: async (p: Promise<{ json: () => Promise<{ data: unknown; meta: unknown }> }>) => {
    const b = await (await p).json();
    return { data: b.data, meta: b.meta };
  },
}));

import { attachmentSrc, createTicket, postMessage, fetchTicketForOrder } from '@/api/support.ts';

const ok = (data: unknown) => Promise.resolve({ json: async () => ({ success: true, data, error: null }) });
const file = (name: string) => new File(['x'], name, { type: 'image/png' });

beforeEach(() => { h.post.mockReset(); h.get.mockReset(); });

describe('attachmentSrc', () => {
  it('maps the backend path onto the Worker proxy', () => {
    expect(attachmentSrc({ id: 12, url: 'public/storefront/support/attachments/12?exp=1&sig=ab', width: 1, height: 1 }))
      .toBe('/api/storefront/support/attachments/12?exp=1&sig=ab');
  });
});

describe('multipart bodies', () => {
  it('createTicket sends every file under "files" and leaves content-type to the browser', async () => {
    h.post.mockReturnValue(ok({ id: 1 }));
    await createTicket({ subject: 'Hi', body: 'Where is it', orderReference: 'ORD-1', files: [file('a.png'), file('b.png')] });
    const [path, opts] = h.post.mock.calls[0]!;
    expect(path).toBe('storefront/support/tickets');
    const fd = opts.body as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('subject')).toBe('Hi');
    expect(fd.get('body')).toBe('Where is it');
    expect(fd.get('orderReference')).toBe('ORD-1');
    expect(fd.getAll('files').map((f) => (f as File).name)).toEqual(['a.png', 'b.png']);
    expect(opts.headers).toBeUndefined();
  });

  it('omits orderReference when there is none', async () => {
    h.post.mockReturnValue(ok({ id: 1 }));
    await createTicket({ subject: 'Hi', body: 'x', files: [] });
    expect((h.post.mock.calls[0]![1].body as FormData).has('orderReference')).toBe(false);
  });

  it('postMessage sends body and files to the ticket', async () => {
    h.post.mockReturnValue(ok({ id: 5 }));
    await postMessage(7, { body: '', files: [file('c.png')] });
    const [path, opts] = h.post.mock.calls[0]!;
    expect(path).toBe('storefront/support/tickets/7/messages');
    const fd = opts.body as FormData;
    expect(fd.get('body')).toBe('');
    expect(fd.getAll('files')).toHaveLength(1);
  });
});

describe('fetchTicketForOrder', () => {
  it('encodes the reference and unwraps ticketId', async () => {
    h.get.mockReturnValue(ok({ ticketId: 9 }));
    expect(await fetchTicketForOrder('A/B')).toBe(9);
    expect(h.get.mock.calls[0]![0]).toBe('storefront/support/tickets/by-order/A%2FB');
  });
});
