/**
 * Inline SVG glyphs for the shell chrome. Hairline strokes with square caps to
 * match the chassis' rule-and-micro-caps idiom; every glyph inherits
 * `currentColor` so colour always comes from a `--sf-*` token on the parent.
 */
interface GlyphProps {
  size?: number;
}

function stroke(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    'aria-hidden': true,
  };
}

export function BagIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <path d="M5 7h14l-1.3 12.1a1.5 1.5 0 0 1-1.5 1.4H7.8a1.5 1.5 0 0 1-1.5-1.4L5 7z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function UserIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.6 20.2c1.1-3.7 4-5.6 7.4-5.6s6.3 1.9 7.4 5.6" />
    </svg>
  );
}

export function SearchIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 4.6 4.6" />
    </svg>
  );
}

/** Three shortening rules — the index narrowing to a selection, drawn in the chassis' own hairlines. */
export function FilterIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M10 17h4" />
    </svg>
  );
}

export function PlusIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </svg>
  );
}

export function MinusIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <path d="M5.5 12h13" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

/** Points down at rest; callers rotate it in CSS for "more this way". */
export function ChevronIcon({ size = 16 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <path d="m5 9 7 7 7-7" />
    </svg>
  );
}

/** Heavier than the rest on purpose: it is drawn at 11–13px inside status marks. */
export function CheckIcon({ size = 12 }: GlyphProps) {
  return (
    <svg {...stroke(size)} strokeWidth={2.6}>
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </svg>
  );
}

export function CopyIcon({ size = 13 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <rect x="9" y="9" width="11" height="11" />
      <path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" />
    </svg>
  );
}

export function ClockIcon({ size = 13 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** "This opens somewhere else" — pinned to links that leave the shop. */
export function ArrowUpRightIcon({ size = 13 }: GlyphProps) {
  return (
    <svg {...stroke(size)}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export function WhatsAppIcon({ size = 16 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.5 3.47 1.36 4.92L2 22l5.32-1.4a9.86 9.86 0 0 0 4.72 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.83 9.83 0 0 0 12.04 2zm5.85 14.13c-.25.7-1.45 1.34-2 1.39-.51.05-1.13.07-1.83-.12-.42-.13-.97-.31-1.66-.6-2.93-1.27-4.84-4.22-4.99-4.41-.15-.2-1.19-1.59-1.19-3.04 0-1.45.76-2.16 1.03-2.45.27-.3.59-.37.79-.37l.57.01c.18.01.43-.07.67.51.25.6.84 2.06.91 2.21.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.32.4-.45.54-.15.15-.31.31-.13.61.18.3.79 1.31 1.7 2.12 1.17 1.04 2.16 1.36 2.46 1.51.3.15.47.13.65-.07.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.74.82 2.04.97.3.15.5.22.57.35.07.13.07.74-.18 1.44z" />
    </svg>
  );
}

export function TelegramIcon({ size = 16 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.43 3.36 2.3 11.13c-.86.35-.85 1.58.02 1.91l4.78 1.85 1.85 5.93c.21.66.99.85 1.45.36l2.74-2.91 4.66 3.42c.69.5 1.66.13 1.83-.7l3.07-15.18c.19-.92-.71-1.69-1.59-1.34zm-3.9 5.7-7.34 6.86c-.32.3-.45.71-.4 1.11l.32 2.8-1.83-5.45 8.78-5.71c.49-.32.95.14.47.39z" />
    </svg>
  );
}
