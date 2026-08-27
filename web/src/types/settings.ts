export type NoticeStyle = 'info' | 'warning' | 'promo';
export interface Notice { id: string; style: NoticeStyle; title: string | null; body: string; startsAt: string | null; endsAt: string | null; active: boolean }
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export interface CutoffDay { enabled: boolean; cutoff: string; shipsOn: string }
export interface Cutoffs { timezone: string; days: Record<DayKey, CutoffDay> }
export type ContactFieldMode = 'required' | 'optional' | 'hidden';
export interface ContactModes { phoneMode: ContactFieldMode; emailMode: ContactFieldMode; defaultPhoneCountry: string | null }
export interface SupportLink { label: string; url: string }
export interface Brand {
  name: string; shortName: string; tagline: string; title: string; description: string;
  logoUrl: string | null; faviconUrl: string | null; logoHeight: number;
  links: { whatsapp: string | null; telegram: string | null };
}
export type LayoutKind = 'storefront' | 'menu';
export interface Features {
  layout: LayoutKind; ordering: boolean; guestCheckout: boolean; accounts: boolean;
  verify: boolean; tracking: boolean; wholesale: boolean; upsell: boolean;
}
export interface Theme {
  scheme: 'dark' | 'light';
  colors: { primary: string; bg: string; surface: string; text: string; muted: string; success: string; warn: string; danger: string };
  fonts: { heading: string | null; body: string | null; mono: string | null };
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  density: 'comfortable' | 'compact';
  customCss: string;
}
export interface StorefrontSettings {
  enabled: boolean; closedMessage: string; welcomeMessage: string | null;
  notices: Notice[]; cutoffs: Cutoffs; serverTime: string; contactModes: ContactModes;
  currency: string; supportLinks: SupportLink[];
  login: { whatsapp: { available: boolean; number: string | null }; telegram: { available: boolean; botUsername: string | null } };
  brand: Brand; features: Features; theme: Theme; turnstile: { siteKey: string } | null;
}
