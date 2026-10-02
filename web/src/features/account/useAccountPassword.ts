import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/app/settings.ts';
import { requestEmailVerification, setAccountPassword } from '@/api/auth.ts';
import { PROFILE_KEY } from '@/features/account/queries.ts';
import {
  buildIdentifier, checkCurrentPassword, checkNewPassword, type IdentifierKind,
} from '@/features/auth/password-identifier.ts';
import { passwordErrorMessage } from '@/features/auth/password-errors.ts';
import { ApiError } from '@/lib/errors.ts';
import type { PasswordIdentifier, SetPasswordInput } from '@/types/auth.ts';
import type { Profile } from '@/types/profile.ts';

export type AccountPasswordField = 'email' | 'phone' | 'prefix' | 'current' | 'next';
export interface AccountPasswordValues { email: string; phone: string; prefix: string; current: string; next: string }
export interface AccountPasswordErrors { email?: string; phone?: string; current?: string; next?: string; form?: string }

export interface AccountPassword {
  /** The account already has a usable password: changing it asks for the current one. */
  hasPassword: boolean;
  /**
   * The form must carry an email or a phone: only a customer with NO email, NO phone and NO login identifier on
   * record (a Telegram-only account). For everyone else the backend answers 422 to an identifier in the body, so
   * the form never renders (or sends) one.
   */
  needsIdentifier: boolean;
  open: boolean;
  openForm: () => void;
  cancel: () => void;
  kind: IdentifierKind;
  setKind: (kind: IdentifierKind) => void;
  values: AccountPasswordValues;
  setValue: (field: AccountPasswordField, value: string) => void;
  errors: AccountPasswordErrors;
  pending: boolean;
  /** Shown after a successful save until the form is opened again. */
  saved: boolean;
  submit: () => Promise<void>;
  verification: { canSend: boolean; sending: boolean; sent: boolean; error: string | null; send: () => Promise<void> };
}

const identifierFields = (id: PasswordIdentifier): Pick<SetPasswordInput, 'email' | 'phone' | 'phoneCountry'> =>
  'email' in id ? { email: id.email } : { phone: id.phone, ...(id.phoneCountry ? { phoneCountry: id.phoneCountry } : {}) };

/**
 * The profile's Password section. A wrong current password is `422 CURRENT_PASSWORD_INCORRECT` (never a 401, which
 * this client treats as a dead session) and is shown on the current-password field. After a save the profile is
 * refetched, not inferred: the backend may give the login fewer identifiers than the record shows.
 */
export function useAccountPassword(profile: Profile, options: { resetByEmail: boolean }): AccountPassword {
  const settings = useSettings();
  const client = useQueryClient();
  const info = profile.password;
  const hasPassword = info?.set === true;
  const needsIdentifier = !hasPassword
    && profile.identities.email === false && profile.identities.whatsapp === false
    && (info?.loginEmail ?? null) === null && (info?.loginPhone ?? null) === null;

  const empty = (): AccountPasswordValues => ({
    email: '', phone: '', prefix: settings.contactModes?.defaultPhoneCountry ?? '', current: '', next: '',
  });
  const [open, setOpen] = useState(false);
  const [kind, setKindState] = useState<IdentifierKind>('email');
  const [values, setValues] = useState<AccountPasswordValues>(empty);
  const [errors, setErrors] = useState<AccountPasswordErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const busy = useRef(false);
  const sendBusy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const openForm = useCallback(() => { setOpen(true); setSaved(false); setErrors({}); }, []);
  const cancel = useCallback(() => {
    setOpen(false);
    setErrors({});
    setValues((v) => ({ ...v, current: '', next: '' }));
  }, []);
  const setKind = useCallback((next: IdentifierKind) => { setKindState(next); setErrors({}); }, []);
  const setValue = useCallback((field: AccountPasswordField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, form: undefined, [field === 'prefix' ? 'phone' : field]: undefined }));
  }, []);

  const submit = useCallback(async () => {
    if (busy.current) return;
    const next: AccountPasswordErrors = {};
    const newError = checkNewPassword(values.next);
    if (newError) next.next = newError;
    if (hasPassword) {
      const m = checkCurrentPassword(values.current);
      if (m) next.current = m;
    }
    let identifier: PasswordIdentifier | null = null;
    if (needsIdentifier) {
      const id = buildIdentifier({ kind, email: values.email, phone: values.phone, prefix: values.prefix });
      if (id.ok) identifier = id.identifier;
      else next[id.field] = id.message;
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    const input: SetPasswordInput = {
      newPassword: values.next,
      ...(hasPassword ? { currentPassword: values.current } : {}),
      ...(identifier ? identifierFields(identifier) : {}),
    };
    busy.current = true;
    setPending(true);
    setErrors({});
    try {
      await setAccountPassword(input);
      // Both password fields are done with once the call resolves; a failed attempt keeps them for a retry.
      if (mounted.current) {
        setSaved(true);
        setOpen(false);
        setValues((v) => ({ ...v, current: '', next: '' }));
      }
      void client.invalidateQueries({ queryKey: PROFILE_KEY });
    } catch (err) {
      if (!mounted.current) return;
      const message = passwordErrorMessage(err, 'set');
      const wrongCurrent = err instanceof ApiError && err.isCurrentPasswordIncorrect;
      setErrors(wrongCurrent ? { current: message } : { form: message });
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }, [values, hasPassword, needsIdentifier, kind, client]);

  const send = useCallback(async () => {
    if (sendBusy.current) return;
    sendBusy.current = true;
    setSending(true);
    setVerifyError(null);
    try {
      await requestEmailVerification();
      if (mounted.current) setSent(true);
    } catch (err) {
      if (mounted.current) setVerifyError(passwordErrorMessage(err, 'forgot'));
    } finally {
      sendBusy.current = false;
      if (mounted.current) setSending(false);
    }
  }, []);

  const canSend = options.resetByEmail && Boolean(info?.loginEmail) && info?.emailVerified === false;

  return {
    hasPassword, needsIdentifier, open, openForm, cancel, kind, setKind, values, setValue, errors, pending, saved, submit,
    verification: { canSend, sending, sent, error: verifyError, send },
  };
}
