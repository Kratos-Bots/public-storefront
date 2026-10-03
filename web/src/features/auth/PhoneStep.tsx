import { useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { ArrowLeftIcon, SmsIcon, WhatsAppIcon } from '@/components/icons.tsx';
import { AuthNote } from '@/features/auth/AuthNote.tsx';
import { PhoneEntry } from '@/features/auth/PhoneEntry.tsx';
import { WhatsappLogin } from '@/features/auth/WhatsappLogin.tsx';
import { preferredPhoneCountries } from '@/features/auth/phone-countries.ts';
import { buildIdentifier } from '@/features/auth/password-identifier.ts';
import type { CodeLogin } from '@/features/auth/useCodeLogin.ts';
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

  const back = (
    <button type="button" className={buttons.back} disabled={form.pending} onClick={() => form.go('choose')}>
      <ArrowLeftIcon size={18} />
      {t('auth.code.back')}
    </button>
  );

  if (phone.mode === 'whatsapp') {
    return (
      <div className={password.root}>
        {waiting ? null : back}
        {waiting ? null : <h2 className={password.title}>{t('auth.code.phone.title')}</h2>}
        {waiting ? null : <p className={password.body}>{t('auth.code.phone.whatsappBody')}</p>}
        <WhatsappLogin number={settings.login.whatsapp.number} onWaiting={setWaiting} />
      </div>
    );
  }

  const channels = phone.channels.filter((c) => c === 'whatsapp' || c === 'sms');

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
    void form.sendPhone(id.identifier.phone, channel);
  };

  return (
    <div className={password.root}>
      {back}
      <h2 className={password.title}>{t('auth.code.phone.title')}</h2>
      <div className={password.form}>
        <PhoneEntry
          prefix={prefix}
          phone={number}
          preferred={preferredPhoneCountries(settings)}
          countryError={errors.country}
          phoneError={errors.phone}
          onPrefixChange={(v) => { setPrefix(v); setErrors((e) => ({ ...e, country: undefined })); }}
          onPhoneChange={(v) => { setNumber(v); setErrors({}); }}
        />
        {form.failure ? <div role="alert"><AuthNote tone="danger">{form.failure.message}</AuthNote></div> : null}
        <div className={classes.channels}>
          {channels.includes('whatsapp') ? (
            <button type="button" className={buttons.quick} disabled={form.pending} onClick={() => send('whatsapp')}>
              <span className={buttons.icon}><WhatsAppIcon size={20} /></span>
              {form.pending ? t('auth.password.working') : t('auth.code.phone.sendWhatsapp')}
            </button>
          ) : null}
          {channels.includes('sms') ? (
            <button type="button" className={buttons.quick} disabled={form.pending} onClick={() => send('sms')}>
              <span className={buttons.icon}><SmsIcon size={20} /></span>
              {form.pending ? t('auth.password.working') : t('auth.code.phone.sendSms')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
