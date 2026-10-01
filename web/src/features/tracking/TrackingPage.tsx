import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { TrackingLookupError, lookupTracking } from '@/api/tracking.ts';
import { useSettings } from '@/app/settings.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import type { SlotRender } from '@/builder/define.ts';
import { TrackingFamily, type TrackingData, type TrackingPhase, type TrackingPreview } from '@/builder/family-tracking.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import { TRACKING_VIEWS } from '@/features/tracking/tracking-parts.tsx';
import { TrackingUnavailableScreen } from '@/features/tracking/StateScreens.tsx';
import type { TrackingLookup } from '@/types/tracking.ts';
import classes from '@/features/tracking/Tracking.module.css';

type Phase = TrackingPhase;

/**
 * How long to wait for the invisible Turnstile challenge to hand over a token
 * before telling the visitor it isn't coming. It normally resolves in well under
 * a second; this only elapses when the challenge script is blocked or the widget
 * errored for good. Without it the page sits on the skeleton forever with
 * nothing to read.
 */
const TOKEN_WAIT_MS = 15_000;

/** The page builder's frame runs no challenge: every lookup there is answered in the frame. */
const PREVIEW_TOKEN = 'sf-builder-preview';

/**
 * Where an order is, from nothing but its reference.
 *
 * The reference alone is the credential, which is why a Cloudflare challenge
 * stands in front of every lookup — and why the orchestration below is the
 * fiddliest part of the page. Four effects, in this order, each guarding a
 * failure the others create.
 */
export function TrackingPage({ slots }: { slots?: Record<string, SlotRender> } = {}) {
  const legacy = useMemo(() => (slots ? null : defaultSlotRenders('TrackingLookup', 'storefront', {}, 'tracking')), [slots]);
  const s = slots ?? legacy!;
  /** The editor's preview state: replaces the state machine's outputs, no lookup and no challenge. */
  const fixture = usePreviewFixture<TrackingPreview>('TrackingLookup');
  const { reference } = useParams<{ reference?: string }>();
  const ref = reference?.trim().toUpperCase() ?? '';
  const settings = useSettings();
  const siteKey = settings.turnstile?.siteKey ?? null;

  const [phase, setPhase] = useState<Phase>(ref ? 'pending' : 'idle');
  const [data, setData] = useState<TrackingLookup | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  /** The status behind an `error` phase — four of them, four different screens. */
  const [errorStatus, setErrorStatus] = useState(0);
  /** True while we're on the skeleton with no token yet — drives the honest
   *  "checking you're human" line so the wait isn't a bare skeleton. */
  const [awaitingToken, setAwaitingToken] = useState(false);

  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const tokenRef = useRef<string>(isBuilderMode() ? PREVIEW_TOKEN : '');
  /** A lookup is in flight. The token-wait timer must not arm during one: run()
   *  consumes the token as it starts, so an in-flight request looks exactly like
   *  "pending with no token". */
  const inFlight = useRef(false);
  /** Bounds the onError → reset() retry loop. */
  const errorResets = useRef(0);
  /** Reference already auto-fetched, so a re-minted token can't re-trigger it. */
  const attemptedFor = useRef<string>('');
  /** Reference currently on screen — kept in step by the reset effect below.
   *  run()'s completion handlers compare against it to spot a stale response:
   *  the visitor can navigate to another reference (Back, a Recent chip, an
   *  address-bar edit) while an older request is still in flight, and that
   *  answer must not paint over what is now current. */
  const latestRef = useRef<string>(ref);
  /** Bumped whenever a fresh token lands, so the fetch effect can re-run once one
   *  exists without re-running on every unrelated render. */
  const [tokenSeq, setTokenSeq] = useState(0);

  const run = useCallback(async (refresh: boolean) => {
    if (!ref || fixture) return;
    const token = tokenRef.current;
    if (!token) {
      // No token in hand — the challenge is still resolving, or it expired or
      // errored since the last lookup. Returning silently here is what would
      // make "Try again" and Refresh dead controls, so instead: ask the widget
      // for a fresh token and re-open the fetch effect's guard so it fires the
      // moment one lands. If none ever does, the bounded wait below surfaces the
      // blocked screen rather than a spinner.
      attemptedFor.current = '';
      setIsRefreshing(false);
      setPhase('pending');
      turnstileRef.current?.reset();
      return;
    }
    tokenRef.current = isBuilderMode() ? PREVIEW_TOKEN : ''; // single-use
    inFlight.current = true;
    if (refresh) setIsRefreshing(true);
    else setPhase('pending');
    try {
      const result = await lookupTracking({ reference: ref, turnstileToken: token, refresh });
      if (latestRef.current !== ref) return;
      setData(result);
      setPhase('found');
    } catch (err) {
      if (latestRef.current !== ref) return;
      const status = err instanceof TrackingLookupError ? err.status : 0;
      if (status === 404) {
        setPhase('notFound');
      } else {
        setErrorStatus(status);
        setPhase('error');
      }
    } finally {
      inFlight.current = false;
      // Only clear isRefreshing while this reference is still the one on screen —
      // a stale completion must not stomp a newer reference's own flag. The
      // widget reset always runs, staleness aside: this request consumed a token
      // and whichever reference is current still needs a fresh one next.
      if (latestRef.current === ref) setIsRefreshing(false);
      turnstileRef.current?.reset(); // mint the next token
    }
  }, [ref, fixture]);

  // 1. A new :reference means a different order — drop the old result. Updating
  //    latestRef here (rather than inline where `ref` is computed) keeps it in
  //    step with the render that owns it, well before any in-flight request for
  //    the previous reference could resolve.
  //
  //    isRefreshing is cleared here too: run()'s `finally` only clears it while
  //    `latestRef.current === ref` holds, so a refresh in flight for the
  //    reference being navigated away from skips that clear — by design, so it
  //    cannot stomp the new reference's flag. Nothing else would ever flip it
  //    back, so without this the Refresh button would stay on "Checking…".
  //
  //    attemptedFor is cleared here too, and it must be: react-router does not
  //    key RenderedRoute, so /tracking ↔ /tracking/:reference is the SAME
  //    component instance and the ref survives navigation. Without this,
  //    re-opening a reference already looked up in this instance (a Recent chip,
  //    browser Back) left the fetch guard armed, no request was ever made, and
  //    the page hung on the skeleton. Clearing it HERE and only here keeps the
  //    intra-reference protection intact: this effect's deps are [ref] alone, so
  //    a re-minted token cannot reopen the guard.
  useEffect(() => {
    latestRef.current = ref;
    attemptedFor.current = '';
    setData(null);
    setPhase(ref ? 'pending' : 'idle');
    setIsRefreshing(false);
  }, [ref]);

  // 2. Bounded wait for a token.
  //
  //    Declared BEFORE the fetch effect on purpose: on the commit where a fresh
  //    token lands this runs while tokenRef still holds it, so it clears the
  //    timer instead of arming one for the request that is about to start. The
  //    inFlight guard covers the reverse ordering (run() clears the token
  //    synchronously, then a phase change re-enters here mid-request).
  useEffect(() => {
    // No site key means no widget to wait for — that page says so directly and
    // has no use for a countdown to a screen it will never show.
    if (fixture || !siteKey || phase !== 'pending' || tokenRef.current || inFlight.current) {
      setAwaitingToken(false);
      return;
    }
    setAwaitingToken(true);
    const id = window.setTimeout(() => setPhase('blocked'), TOKEN_WAIT_MS);
    return () => window.clearTimeout(id);
    // Deliberately not keyed on anything that flips while the challenge retries:
    // the deadline is wall-clock from the moment the wait starts, and an extra
    // dep would restart the timer instead of letting it expire.
  }, [siteKey, phase, tokenSeq, ref, fixture]);

  // 3. Fetch ONCE per reference, as soon as a token exists.
  //
  //    The attemptedFor guard is load-bearing: run() resets the widget in its
  //    finally block, which mints a new token and bumps tokenSeq. Guarding on
  //    `data`/`phase` instead would re-enter this forever on the notFound and
  //    error paths, where data stays null.
  useEffect(() => {
    if (fixture || !ref || !tokenRef.current || attemptedFor.current === ref) return;
    attemptedFor.current = ref;
    void run(false);
  }, [ref, tokenSeq, run, fixture]);

  // Once there is an answer — or one is a moment away — the masthead is dead
  // weight above the fold, so it collapses to a line of context and the status
  // itself starts the page.
  const livePhase: Phase = phase;
  const outPhase = fixture ? fixture.phase : livePhase;
  const outData = fixture ? fixture.data : data ?? undefined;
  const compact = fixture ? fixture.compact : phase === 'pending' || (phase === 'found' && !!data);
  const outBusy = fixture ? false : isRefreshing;
  const outAwaiting = fixture ? fixture.phase === 'pending' : awaitingToken;
  const outErrorStatus = fixture ? fixture.errorStatus ?? null : errorStatus;
  const value = useMemo<{ data: TrackingData; views: typeof TRACKING_VIEWS }>(
    () => ({
      data: {
        phase: outPhase, compact, data: outData, isRefreshing: outBusy, awaitingToken: outAwaiting, errorStatus: outErrorStatus,
        retry: () => void run(false),
        refresh: () => void run(true),
        reload: () => (fixture ? undefined : window.location.reload()),
      },
      views: TRACKING_VIEWS,
    }),
    [outPhase, compact, outData, outBusy, outAwaiting, outErrorStatus, run, fixture],
  );

  // The flag is on but no site key is configured, so the widget can never mount
  // and every lookup would hang on a token that will never come — and the
  // backend answers this route 503 anyway. (The editor's preview has no use for the screen.)
  if (!siteKey && !fixture) {
    return (
      <div className={classes.page}>
        <TrackingUnavailableScreen />
      </div>
    );
  }

  return (
    <TrackingFamily.Provider value={value}>
      <div className={classes.page}>
        {s.top()}
        {s.main()}
        {outPhase === 'found' && outData ? (
          // aria-busy reflects a background refresh: the answer already on screen
          // stays readable underneath while a fresher one is fetched.
          <div aria-busy={outBusy}>{s.result()}</div>
        ) : null}

        {/* Invisible: runs silently and resolves a token without any UI. Never in the builder frame. */}
        {isBuilderMode() || fixture ? null : <Turnstile
          ref={turnstileRef}
          siteKey={siteKey!}
          options={{ size: 'invisible' }}
          onSuccess={(token) => {
            tokenRef.current = token;
            setTokenSeq((n) => n + 1);
          }}
          onExpire={() => {
            tokenRef.current = '';
            turnstileRef.current?.reset();
          }}
          onError={() => {
            tokenRef.current = '';
            // Re-arm as onExpire does — otherwise one transient challenge failure
            // leaves the page with no token and every control dead. Bounded,
            // because unlike expiry an error can be permanent (script blocked,
            // wrong key) and an unbounded reset loop would hammer the challenge
            // endpoint; the bounded wait above then takes over.
            if (errorResets.current < 2) {
              errorResets.current += 1;
              turnstileRef.current?.reset();
            }
          }}
        />}
      </div>
    </TrackingFamily.Provider>
  );
}
