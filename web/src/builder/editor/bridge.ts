import {
  changeMessage, parseInbound, readyMessage, uploadRequestMessage, viewportMessage,
  type ChangeMessage, type ChangeText, type LoadMessage, type Outbound, type ViewportWidth,
} from '@/builder/editor/protocol.ts';
import type { DocKey, Issue, PageSet } from '@/builder/types.ts';
import type { Theme } from '@/types/settings.ts';

export const CHANGE_DEBOUNCE_MS = 500;
export const UPLOAD_TIMEOUT_MS = 60_000;

export interface BridgeHandlers {
  /** Runs after the bridge has adopted the load's loadId and dropped any pending change. */
  onLoad(msg: LoadMessage): void;
  onTheme(theme: Theme): void;
  onSelectPage(docKey: DocKey): void;
}

export interface Bridge {
  /** Debounced 500 ms; only the newest change is sent, stamped with the current loadId. No-op before a load and while it is read-only. */
  postChange(pageSet: PageSet, issues: Issue[], text?: ChangeText): void;
  /** Send a pending change now (also runs on the frame's blur, pagehide and visibilitychange→hidden). */
  flushChange(): void;
  /** The admin performs the authenticated upload; resolves to the stored URL. */
  requestUpload(file: File): Promise<string>;
  /** Not debounced: the admin resizes the frame to this width (null = fill). No-op before a load. */
  postViewport(width: ViewportWidth | null): void;
  dispose(): void;
}

/** A real origin we can target; sandboxed/opaque frames report the string "null". */
const TARGETABLE_ORIGIN = /^https?:\/\/[^/\s]+$/;

interface PendingUpload {
  resolve: (url: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createBridge(win: Window, handlers: BridgeHandlers): Bridge {
  let adminOrigin: string | null = null;
  let current: { loadId: string; readOnly: boolean } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: ChangeMessage | null = null;
  let seq = 0;
  let disposed = false;
  const uploads = new Map<string, PendingUpload>();

  // Everything but sf-builder-ready goes only to the origin pinned by the first accepted load.
  const post = (msg: Outbound) => {
    if (adminOrigin && !disposed) win.parent.postMessage(msg, adminOrigin);
  };

  const cancelChange = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  const flushChange = () => {
    const msg = pending;
    cancelChange();
    if (msg) post(msg);
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== win.parent) return;
    const msg = parseInbound(event.data);
    if (!msg) return;
    // Once a load has fixed the admin's origin, nobody else speaks for it.
    if (adminOrigin !== null && event.origin !== adminOrigin) return;
    switch (msg.type) {
      case 'sf-builder-load':
        if (adminOrigin === null && !TARGETABLE_ORIGIN.test(event.origin)) return;
        adminOrigin = event.origin;
        // A change debounced under the previous load must never be sent under this one.
        cancelChange();
        current = { loadId: msg.loadId, readOnly: msg.readOnly };
        handlers.onLoad(msg);
        return;
      case 'sf-builder-theme':
        handlers.onTheme(msg.theme);
        return;
      case 'sf-builder-select-page':
        if (adminOrigin) handlers.onSelectPage(msg.docKey);
        return;
      case 'sf-builder-upload-result': {
        const entry = uploads.get(msg.requestId);
        if (!entry) return;
        uploads.delete(msg.requestId);
        clearTimeout(entry.timer);
        if (msg.url) entry.resolve(msg.url);
        else entry.reject(new Error(msg.error ?? 'Upload failed'));
        return;
      }
    }
  };

  win.addEventListener('message', onMessage);
  // The owner's next click is often in the admin (Publish, Save, switching tabs), which can act on
  // the set before the 500 ms debounce fires: send the pending change the moment the frame loses
  // focus, is hidden, or unloads.
  const onLeave = (event: Event) => {
    const hidden = event.type === 'visibilitychange' && win.document?.visibilityState === 'hidden';
    if (event.type === 'blur' || event.type === 'pagehide' || hidden) flushChange();
  };
  win.addEventListener('blur', onLeave);
  win.addEventListener('pagehide', onLeave);
  win.document?.addEventListener('visibilitychange', onLeave);
  // Carries nothing, so it may go to '*': the admin answers with a load, whose origin we then pin.
  // Sent exactly once per bridge; session.ts creates one bridge per frame boot.
  win.parent.postMessage(readyMessage(), '*');

  return {
    postChange(pageSet, issues, text) {
      if (!current || current.readOnly || disposed) return;
      // Stamped now, so the message always carries the load it was produced from.
      pending = changeMessage(current.loadId, pageSet, issues, text);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flushChange, CHANGE_DEBOUNCE_MS);
    },
    flushChange,
    requestUpload(file) {
      if (!adminOrigin || disposed) return Promise.reject(new Error('The editor is not connected to the admin yet.'));
      seq += 1;
      const requestId = `upload-${Date.now().toString(36)}-${seq}`;
      return new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => {
          uploads.delete(requestId);
          reject(new Error('The upload timed out.'));
        }, UPLOAD_TIMEOUT_MS);
        uploads.set(requestId, { resolve, reject, timer: t });
        post(uploadRequestMessage(requestId, file));
      });
    },
    postViewport(width) {
      post(viewportMessage(width));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      win.removeEventListener('message', onMessage);
      win.removeEventListener('blur', onLeave);
      win.removeEventListener('pagehide', onLeave);
      win.document?.removeEventListener('visibilitychange', onLeave);
      cancelChange();
      for (const entry of uploads.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('The editor closed before the upload finished.'));
      }
      uploads.clear();
    },
  };
}

let active: Bridge | null = null;
/** The image field reaches the bridge through this; set by session.ts. */
export function setActiveBridge(bridge: Bridge | null): void {
  active = bridge;
}
export function getActiveBridge(): Bridge | null {
  return active;
}
