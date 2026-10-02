import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useSettings } from '@/app/settings.ts';
import { passwordForgot, passwordLogin, passwordSignup } from '@/api/auth.ts';
import type { GuestTurnstileHandle } from '@/features/checkout/GuestTurnstile.tsx';
import {
  buildIdentifier, checkCurrentPassword, checkNewPassword, type IdentifierKind,
} from '@/features/auth/password-identifier.ts';
import { passwordErrorMessage, whatsappResetHref } from '@/features/auth/password-errors.ts';
import { useLoginSuccess } from '@/features/auth/useLoginSuccess.ts';
import { textSnapshot } from '@/text/snapshot.ts';

export type PasswordMode = 'signin' | 'signup' | 'forgot';
export type ForgotRoute = 'whatsapp' | 'email' | 'none';
export type PasswordField = 'email' | 'phone' | 'prefix' | 'password';
export interface PasswordFormValues { email: string; phone: string; prefix: string; password: string }
export interface PasswordFormErrors { email?: string; phone?: string; password?: string; form?: string }

export interface PasswordLogin {
  mode: PasswordMode;
  /** Keeps the typed email/phone, clears the password, the errors and the "link sent" note. */
  setMode: (mode: PasswordMode) => void;
  kind: IdentifierKind;
  setKind: (kind: IdentifierKind) => void;
  values: PasswordFormValues;
  setValue: (field: PasswordField, value: string) => void;
  errors: PasswordFormErrors;
  pending: boolean;
  /** Forgot by email: the neutral "a link is on its way" note is showing. */
  sent: boolean;
  forgotRoute: ForgotRoute;
  /** The `wa.me` link; non-null only when `forgotRoute === 'whatsapp'`. */
  whatsappHref: string | null;
  /** The current mode asks Turnstile for a token: the card must mount `<GuestTurnstile>`. */
  needsTurnstile: boolean;
  submit: () => Promise<void>;
}

/**
 * The sign-in card's whole behaviour, so the card itself is only markup. Every success goes through
 * `useLoginSuccess` (basket merge, `returnTo`). Passwords stay in this hook's state only.
 */
export function usePasswordLogin(turnstile: RefObject<GuestTurnstileHandle | null>): PasswordLogin {
  const settings = useSettings();
  const onLogin = useLoginSuccess();
  const policy = settings.login.password;
  const hasTurnstile = Boolean(settings.turnstile);

  const [mode, setModeState] = useState<PasswordMode>('signin');
  const [kind, setKindState] = useState<IdentifierKind>('email');
  const [values, setValues] = useState<PasswordFormValues>(() => ({
    email: '', phone: '', prefix: settings.contactModes?.defaultPhoneCountry ?? '', password: '',
  }));
  const [errors, setErrors] = useState<PasswordFormErrors>({});
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const waHref = whatsappResetHref(settings.login.whatsapp.number);
  const forgotRoute: ForgotRoute = kind === 'phone'
    ? (policy?.resetByWhatsapp && waHref ? 'whatsapp' : 'none')
    : (policy?.resetByEmail ? 'email' : 'none');
  const needsTurnstile = hasTurnstile && (mode === 'signup' || (mode === 'forgot' && forgotRoute === 'email'));

  const setMode = useCallback((next: PasswordMode) => {
    setModeState(next);
    setErrors({});
    setSent(false);
    setValues((v) => ({ ...v, password: '' }));
  }, []);

  const setKind = useCallback((next: IdentifierKind) => {
    setKindState(next);
    setErrors({});
    setSent(false);
  }, []);

  const setValue = useCallback((field: PasswordField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, form: undefined, [field === 'prefix' ? 'phone' : field]: undefined }));
    if (field === 'email') setSent(false);
  }, []);

  const submit = useCallback(async () => {
    if (busy.current) return;
    if (mode === 'forgot' && forgotRoute !== 'email') return; // the whatsapp and none routes render no form
    const next: PasswordFormErrors = {};
    const id = buildIdentifier({ kind, email: values.email, phone: values.phone, prefix: values.prefix });
    if (!id.ok) next[id.field] = id.message;
    if (mode === 'signin') {
      const m = checkCurrentPassword(values.password);
      if (m) next.password = m;
    }
    if (mode === 'signup') {
      const m = checkNewPassword(values.password);
      if (m) next.password = m;
    }
    if (!id.ok || Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    busy.current = true;
    setPending(true);
    setErrors({});
    try {
      // A token is spent by the call that carries it: mint one per submit, never reuse the last.
      let token: string | undefined;
      if (needsTurnstile && turnstile.current) {
        try {
          token = await turnstile.current.mint();
        } catch (err) {
          if (mounted.current) setErrors({ form: err instanceof Error ? err.message : textSnapshot().t('checkout.errors.verifyFailed') });
          return;
        }
      }
      if (mode === 'signin') {
        await onLogin(await passwordLogin(id.identifier, values.password));
      } else if (mode === 'signup') {
        await onLogin(await passwordSignup(id.identifier, values.password, token));
      } else if ('email' in id.identifier) {
        await passwordForgot(id.identifier.email, token);
        if (mounted.current) setSent(true);
      }
    } catch (err) {
      if (mounted.current) setErrors({ form: passwordErrorMessage(err, mode) });
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }, [mode, forgotRoute, kind, values, needsTurnstile, turnstile, onLogin]);

  return {
    mode, setMode, kind, setKind, values, setValue, errors, pending, sent, forgotRoute,
    whatsappHref: forgotRoute === 'whatsapp' ? waHref : null,
    needsTurnstile, submit,
  };
}
