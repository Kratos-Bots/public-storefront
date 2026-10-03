import { useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { ArrowLeftIcon, SmsIcon, WhatsAppIcon } from '@/components/icons.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { PhoneEntry } from '@/features/auth/PhoneEntry.tsx';
import { WhatsappLogin } from '@/features/auth/WhatsappLogin.tsx';
import { preferredPhoneCountries } from '@/features/auth/phone-countries.ts';
import { buildIdentifier } from '@/features/auth/password-identifier.ts';
import type { CodeLogin } from '@/features/auth/useCodeLogin.ts';
import { useStepFocus } from '@/features/auth/useStepFocus.ts';
import { useText } from '@/text/runtime.tsx';
import type { PhoneLoginSettings } from '@/types/settings.ts';
import buttons from '@/features/auth/AuthButtons.module.css';
import password from '@/features/auth/PasswordLogin.module.css';
import classes from '@/features/auth/CodeSignIn.module.css';

/** International spellings that make the picker irrelevant: `+44…` and the `00` dialling prefix. */
const INTERNATIONAL = /^(\+|00)/;

/**
 * Phone sign-in. With Bird (`mode: 'verify'`) the shopper picks WhatsApp or text message; without it
 * (`mode: 'whatsapp'`) this is today's "message us" flow, which needs no number from them.
 */
export function PhoneStep({ form, phone }: { form: CodeLogin; phone: PhoneLoginSettings }) {
  const settings = useSettings();
  const { t } = useText();
  const [prefix, setPrefix] = useState(settings.contactModes?.defaultPhoneCountry ?? '');
  const [number, setNumber] = useState('');
  const [errors, setErrors] = useState<{ country?: string; phone?: string }>({});
  const [waiting, setWaiting] = useState(false);
  // The failure belongs to the number as it was sent: editing the number or the country retires it.
  const [failureStale, setFailureStale] = useState(false);
  const [sending, setSending] = useState<'whatsapp' | 'sms' | null>(null);
  const root = useStepFocus(phone.mode === 'whatsapp' ? 'h2' : 'input');

  const back = (
    <button type="button" className={buttons.back} disabled={form.pending} onClick={() => form.go('choose')}>
      <ArrowLeftIcon size={18} />
      {t('auth.code.back')}
    </button>
  );

  if (phone.mode === 'whatsapp') {
    return (
      <div className={password.root} ref={root}>
        {waiting ? null : back}
        {waiting ? null : <h2 className={password.title} tabIndex={-1}>{t('auth.code.phone.title')}</h2>}
        {waiting ? null : <p className={password.body}>{t('auth.code.phone.whatsappBody')}</p>}
        <WhatsappLogin number={settings.login.whatsapp.number} onWaiting={setWaiting} />
      </div>
    );
  }

  // Never a dead end: a shop that reports no usable channel still gets a text message button.
  const listed = phone.channels.filter((c): c is 'whatsapp' | 'sms' => c === 'whatsapp' || c === 'sms');
  const channels: Array<'whatsapp' | 'sms'> = listed.length > 0 ? listed : ['sms'];

  const send = (channel: 'whatsapp' | 'sms') => {
    // A number typed as +44… or 0044… carries its own country, so the picker may be empty. Autofill does this.
    if (!prefix && !INTERNATIONAL.test(number.trim())) {
      setErrors({ country: t('auth.code.phone.countryRequired') });
      return;
    }
    const id = buildIdentifier({ kind: 'phone', email: '', phone: number, prefix });
    if (!id.ok || !('phone' in id.identifier)) {
      setErrors({ phone: id.ok ? undefined : id.message });
      return;
    }
    setErrors({});
    setFailureStale(false);
    setSending(channel);
    void form.sendPhone(id.identifier.phone, channel);
  };

  const channelButton = (channel: 'whatsapp' | 'sms', first: boolean) => {
    const whatsapp = channel === 'whatsapp';
    const Icon = whatsapp ? WhatsAppIcon : SmsIcon;
    const label = whatsapp ? t('auth.code.phone.sendWhatsapp') : t('auth.code.phone.sendSms');
    return (
      <button
        key={channel}
        // The first channel is what Enter sends, so it is the form's submit button and the filled one.
        type={first ? 'submit' : 'button'}
        className={first ? buttons.primary : buttons.quick}
        disabled={form.pending}
        onClick={first ? undefined : () => send(channel)}
        {...(first ? { 'data-sf-part': 'button', 'data-variant': 'filled' } : {})}
      >
        <span className={buttons.icon}><Icon size={20} /></span>
        {form.pending && sending === channel ? t('auth.password.working') : label}
      </button>
    );
  };

  return (
    <div className={password.root} ref={root}>
      {back}
      <h2 className={password.title}>{t('auth.code.phone.title')}</h2>
      <p className={password.body}>{t('auth.code.phone.intro')}</p>
      <form className={password.form} noValidate onSubmit={(e) => { e.preventDefault(); send(channels[0]!); }}>
        <PhoneEntry
          prefix={prefix}
          phone={number}
          preferred={preferredPhoneCountries(settings)}
          countryError={errors.country}
          phoneError={errors.phone}
          onPrefixChange={(v) => { setPrefix(v); setFailureStale(true); setErrors((e) => ({ ...e, country: undefined })); }}
          onPhoneChange={(v) => { setNumber(v); setFailureStale(true); setErrors({}); }}
        />
        {form.failure && !failureStale ? <div role="alert"><AuthNote tone="danger">{form.failure.message}</AuthNote></div> : null}
        <div className={classes.channels}>{channels.map((c, i) => channelButton(c, i === 0))}</div>
      </form>
    </div>
  );
}
