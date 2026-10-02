import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { verifyEmail } from '@/api/auth.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import type { VerifyEmailData, VerifyEmailPhase, VerifyEmailPreview } from '@/builder/family-verify-email.ts';
import { PROFILE_KEY } from '@/features/account/queries.ts';
import { ApiError } from '@/lib/errors.ts';

/**
 * `/verify-email?token=…` (signed in; the route's guard sends a signed-out visitor to /login and back).
 * The call consumes the token, so it is a query, not an effect: React Query shares one in-flight request
 * between StrictMode's double mount, where a plain `useEffect` would post twice and report the second
 * (already-used) answer.
 */
export function useVerifyEmail(): VerifyEmailData {
  const [params] = useSearchParams();
  const token = (params.get('token') ?? '').trim();
  const preview = usePreviewFixture<VerifyEmailPreview>('VerifyEmail');
  const client = useQueryClient();
  const verify = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => verifyEmail(token),
    enabled: token !== '' && preview === null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  let phase: VerifyEmailPhase;
  let error: unknown = null;
  if (preview) {
    phase = preview.phase;
  } else if (token === '') {
    phase = 'invalid';
  } else if (verify.isPending) {
    phase = 'verifying';
  } else if (verify.isError) {
    const e = verify.error;
    if (e instanceof ApiError && (e.isVerifyLinkInvalid || e.status === 404)) {
      phase = 'invalid';
    } else if (e instanceof ApiError && e.status === 403 && !e.isBanned) {
      phase = 'otherAccount';
    } else {
      phase = 'error';
      error = e;
    }
  } else {
    phase = 'done';
  }

  useEffect(() => {
    if (phase === 'done' && !preview) void client.invalidateQueries({ queryKey: PROFILE_KEY });
  }, [phase, preview, client]);

  return { phase, error, onRetry: () => { void verify.refetch(); } };
}
