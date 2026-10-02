import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { checkResetToken, passwordReset } from '@/api/auth.ts';
import { usePreviewFixture } from '@/builder/mode.ts';
import type { ResetPasswordData, ResetPasswordPhase, ResetPasswordPreview } from '@/builder/family-reset-password.ts';
import { checkNewPassword } from '@/features/auth/password-identifier.ts';
import { passwordErrorMessage } from '@/features/auth/password-errors.ts';
import { useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';
import { ApiError } from '@/lib/errors.ts';
import type { LoginResult } from '@/types/auth.ts';

/**
 * `/reset-password?token=…`. The check does not consume the token (a mail scanner opening the link is
 * harmless); only the submit does. Opening the link again, or a submit that races a second tab, ends in
 * the expired state. The new password lives in this hook's state only.
 */
export function useResetPassword(): ResetPasswordData {
  const [params] = useSearchParams();
  const token = (params.get('token') ?? '').trim();
  const preview = usePreviewFixture<ResetPasswordPreview>('ResetPassword');
  const onLogin = useLoginSuccess();
  const client = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [spent, setSpent] = useState(false);
  const busy = useRef(false);
  const done = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const check = useQuery({
    queryKey: ['reset-check', token],
    queryFn: () => checkResetToken(token),
    enabled: token !== '' && preview === null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // A reset that went through has consumed the token: leave the cache saying so, for a Back-button return.
  useEffect(() => () => {
    if (done.current) client.setQueryData(['reset-check', token], { valid: false, mode: null });
  }, [client, token]);

  let phase: ResetPasswordPhase;
  let mode: ResetPasswordData['mode'] = null;
  if (preview) {
    phase = preview.phase;
    mode = preview.mode;
  } else if (token === '' || spent) {
    phase = 'expired';
  } else if (check.isPending) {
    phase = 'checking';
  } else if (check.isError) {
    phase = check.error instanceof ApiError && check.error.status === 404 ? 'expired' : 'unreachable';
  } else if (!check.data.valid) {
    phase = 'expired';
  } else {
    phase = 'form';
    mode = check.data.mode;
  }

  async function submit() {
    if (busy.current || preview || phase !== 'form') return;
    const invalid = checkNewPassword(password);
    if (invalid) {
      setError(invalid);
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    let result: LoginResult;
    try {
      result = await passwordReset(token, password);
    } catch (err) {
      if (mounted.current) {
        if (err instanceof ApiError && err.isResetLinkInvalid) {
          setSpent(true);
          setPassword('');
        } else {
          setError(passwordErrorMessage(err, 'reset'));
        }
        setPending(false);
      }
      busy.current = false;
      return;
    }
    // Signed in: the password is no longer needed, and the form stays locked (no second post) until
    // the navigation unmounts the page.
    done.current = true;
    if (mounted.current) setPassword('');
    await onLogin(result);
  }

  return {
    phase,
    mode,
    password,
    onPasswordChange: (value) => { setPassword(value); setError(null); },
    onSubmit: (e: FormEvent) => { e.preventDefault(); void submit(); },
    onRetry: () => { void check.refetch(); },
    pending,
    error,
  };
}
