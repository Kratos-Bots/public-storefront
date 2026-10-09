export type NoticeStyle = 'info' | 'warning' | 'promo';
export interface Notice {
  id: string; style: NoticeStyle; title: string | null; body: string; startsAt: string | null; endsAt: string | null; active: boolean;
  /** Held at the top of the screen, inside the sticky header. Absent on older backends — not pinned. */
  pinned?: boolean;
  /** Shoppers may close it. Absent on older backends — dismissible, as every notice used to be. */
  dismissible?: boolean;
}
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
export type LayoutKind = 'storefront' | 'menu' | 'webapp';
export interface Features {
  layout: LayoutKind; ordering: boolean; guestCheckout: boolean; accounts: boolean;
  verify: boolean; tracking: boolean; wholesale: boolean; upsell: boolean;
  /** Quantity stepper on catalogue cards, rows and upsell cards. Absent on an older backend — read as false. */
  cardStepper?: boolean;
  /** The shopper may choose which warehouse to order from. Absent on an older backend — read as false. */
  warehouseSelect?: boolean;
  /** Ask the shopper to choose a warehouse before any catalogue page, once per visit. Absent — read as false. */
  warehousePrompt?: boolean;
}
export type TemplateOptionValue = boolean | string;
export interface Theme {
  /** Absent on backends older than the template engine — resolves to 'modern'. */
  template?: string;
  preset?: string | null;
  options?: Record<string, TemplateOptionValue>;
  scheme: 'dark' | 'light';
  colors: { primary: string; bg: string; surface: string; text: string; muted: string; success: string; warn: string; danger: string };
  fonts: { heading: string | null; body: string | null; mono: string | null };
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  density: 'comfortable' | 'compact';
  customCss: string;
}
export interface PasswordLoginSettings {
  /** The store switched email/phone + password on. */
  available: boolean;
  /** An emailed reset link works (the backend has a delivery implementation). */
  resetByEmail: boolean;
  /** The shopper can message the shop's WhatsApp number to get a reset link. */
  resetByWhatsapp: boolean;
}
export interface PhoneLoginSettings {
  available: boolean;
  /** `verify`: a code by WhatsApp or text message; `whatsapp`: the shopper messages the shop; null: neither. */
  mode: 'verify' | 'whatsapp' | null;
  channels: Array<'whatsapp' | 'sms'>;
  /** The store's serviceable countries (ISO alpha-2, possibly empty). They lead the country picker. */
  countries: string[];
}
export interface EmailLoginSettings { available: boolean; mode: 'verify' | 'email' | null }
export interface AccessButton { label: string; url: string }

/** Who may use the shop. Identical for every visitor. */
export interface AccessSettings {
  storefront: 'public' | 'login' | 'restricted';
  /** False when no new customer may sign up. */
  registration: boolean;
  deniedMessage: string;
  deniedButtons: AccessButton[];
}
export interface StorefrontSettings {
  enabled: boolean; closedMessage: string; welcomeMessage: string | null;
  notices: Notice[]; cutoffs: Cutoffs; serverTime: string; contactModes: ContactModes;
  currency: string; supportLinks: SupportLink[];
  /**
   * Where the shop can deliver (ISO alpha-2). `countries`: home delivery. `collectionCountries`: a collection
   * point can be offered. Missing (older backend) or empty `countries` = unknown: list every country.
   */
  shipping?: { countries: string[]; collectionCountries?: string[] };
  login: {
    whatsapp: { available: boolean; number: string | null };
    /** `oidc`: Telegram's OpenID Connect sign-in is fully set up (absent on older backends: use the widget). */
    telegram: { available: boolean; botUsername: string | null; oidc?: boolean };
    /** Absent on backends older than password sign-in. */
    password?: PasswordLoginSettings;
    /** Absent on backends older than sign-in by code: the storefront then keeps today's sign-in. */
    phone?: PhoneLoginSettings;
    email?: EmailLoginSettings;
  };
  brand: Brand; features: Features; theme: Theme; turnstile: { siteKey: string } | null;
  /** The bot's effective web app mode. Absent on backends older than the Mini App. */
  telegramWebApp?: { mode: 'off' | 'beta' | 'forced' };
  /** Absent on backends older than shop access. */
  access?: AccessSettings;
}
