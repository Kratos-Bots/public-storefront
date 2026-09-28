# Design Guidelines — Cyber Brutalism

## Visual Style
- **Aesthetic**: Raw, editorial tech UI — strict orthogonal grid, ultra-heavy display type, live system-data elements woven into layout
- **Mood**: Functional, digital, unapologetic. Feels like a live operating system, not a marketing site
- **Inspiration**: Vercel / Linear meets industrial HMI dashboard meets brutalist editorial magazine
- **Modes**: Both light and dark are native to this style — not just a theme toggle, each has its own palette identity

---

## Color Palette

### Dark Mode
- **Background**: `#0D0D0D` — near-black, main surface
- **Surface / Alt**: `#1A1A1A` — slightly lifted, card backgrounds and alternate sections
- **Accent**: `#D4FF00` — acid yellow-green, ALL interactive elements, active states, progress fills
- **Text Primary**: `#FFFFFF`
- **Text Muted**: `rgba(255,255,255,0.38)` — labels, eyebrows, system readouts
- **Border**: `rgba(255,255,255,0.10)` — card outlines, section dividers
- **Border Active**: `#D4FF00` — hover and focus states
- **Status / Operational**: `#00FF88` — pulsing dot indicator only

### Light Mode
- **Background**: `#F4F4EE` — warm off-white
- **Surface / Alt**: `#E8E8E2` — slightly cooler, contrast sections
- **Accent**: `#6B3FF6` — electric purple, primary interactive color
- **Accent Highlight**: `#D4FF00` — acid yellow-green, status badges and highlighted data only
- **Text Primary**: `#111111`
- **Text Muted**: `rgba(17,17,17,0.40)`
- **Border**: `rgba(17,17,17,0.12)`
- **Border Active**: `#6B3FF6`
- **CTA Button** (light mode): `#111111` background + `#D4FF00` or white text with `↗` arrow

> Rule: never introduce a third decorative color. Black is a surface, not a color.

---

## Typography

- **Display Font**: Tektur — geometric, slightly angular grotesque with a technical edge
- **System / Mono Font**: Share Tech Mono — all labels, readouts, eyebrows, terminal elements
- **Hero Headline**: Tektur 700–900, `clamp(4rem, 12vw, 10rem)`, `text-transform: uppercase`, `letter-spacing: -0.02em`, always left-aligned
- **Section Headings**: Tektur 700, `clamp(2rem, 5vw, 3.5rem)`, uppercase
- **Body Copy**: Tektur 400, `1rem`, `line-height: 1.65`, sentence case
- **System Readouts / Labels**: Share Tech Mono 400, `0.6875rem–0.875rem`, uppercase, muted color
- **Section Eyebrows**: Share Tech Mono, `/01` `/02` `/03` format in accent color, above every section heading

---

## Spacing & Layout

- **Overall feel**: Dense but disciplined — sections are full-width and structured, not airy
- **Base unit**: 8px grid
- **Section padding**: `clamp(5rem, 10vw, 8rem)` top and bottom
- **Max content width**: `1280px`, centered, `padding-inline: clamp(1.5rem, 5vw, 4rem)`
- **Grid**: 12-column, `gap: 1.5rem`
- **Work / project grid**: 4-column desktop, 2-column tablet, 1-column mobile
- **Alignment**: Everything left-aligned on desktop — no centered heroes, no centered section headings

---

## Borders & Radius

- **Border radius**: Zero — everywhere, without exception. Buttons, cards, inputs, badges, nav items all use sharp corners
- **Card border**: `1px solid var(--border)`, no background fill
- **Input border**: bottom-only — `border-bottom: 1px solid var(--border)`, no box, no radius
- **Section dividers**: `border-top: 1px solid var(--border)` — no decorative flourishes
- **No box shadows** — depth is created through color contrast and 1px borders only

---

## Buttons

- **Primary**: `background: var(--accent)`, `color: #000`, `border-radius: 0`, `padding: 0.75rem 1.5rem`, Tektur 600, uppercase — always includes an `↗` inline SVG arrow
- **Secondary / Ghost**: `background: transparent`, `border: 1px solid var(--border)`, `color: var(--text)`, `border-radius: 0` — includes a `⊡` expand or `→` arrow icon
- **Hover (primary)**: slight darken on `--accent`
- **Hover (ghost)**: `border-color → var(--accent)`, `color → var(--accent)`, 150ms ease

---

## Signature UI Patterns

These elements define the style — every implementation must include at least 5:

- **System Header Bar**: 32–40px bar above the nav — `SYS.TIME 23:47:12 / UTC+0 · NODE: CYBR_01 · SCN: 0007` in Share Tech Mono, muted, with a bottom border
- **Section Numbers**: Every section preceded by `/01` `/02` `/03` in accent-colored mono
- **Crosshair Corner Marks**: Small `+` marks (12–16px, `opacity: 0.4`) at grid corners and section edges using CSS `::before`/`::after`
- **Terminal Readouts**: `> RENDERING 87%` · `//SCN_01` · `X_36.1749 / Y_-86.7676` — mono, muted, right-aligned in hero or tucked to section edges
- **System Status Block**: CPU / Memory / Uptime / Network rows with thin CSS progress bars (`fill: var(--accent)`) and mono labels
- **Status Badge**: `● ALL SYSTEMS OPERATIONAL` — `background: var(--accent)`, `color: #000`, `border-radius: 0`, pulsing dot
- **Global Node Row**: `LON  ●  NY  +  TYO  +  BER` — Share Tech Mono, small, muted, in footer
- **Hazard Stripe** (dark mode): `repeating-linear-gradient(-45deg, #000 0 10px, var(--accent) 10px 20px)` as footer decoration
- **Bottom Status Bar**: Full-width bar at page bottom — `● CONNECTION SECURE · · · > ACCESS GRANTED_` — dark mode: `bg: var(--accent)`, `color: #000`; light mode: `bg: #111`, `color: var(--accent)`

---

## Icons

- All icons: inline SVG, stroke-only, `stroke-width: 1.5`, no fill, no emoji
- Source shapes: Lucide or Heroicons
- Size: 16–24px depending on context
- Color: inherits `currentColor` — never hardcoded

---

## Components Spotted

- **Nav**: Full-width sticky bar — geometric SVG logo mark left · links with `/` or `+` separators center · SYS.TIME display + filled CTA button right · `border-bottom: 1px solid var(--border)`
- **Hero**: Full-viewport — massive left-aligned headline, tagline in accent color, two CTA buttons (primary filled + ghost), terminal readouts top-right, `//SCN_01` notation, crosshair marks at corners, 3D render or geometric SVG right column
- **Core Principles Grid**: 5-column icon + label + description grid, divided by thin vertical rules
- **Work Grid**: 4-column bordered cells — image fills top 65–70%, project name + category label + `↗` arrow below, hover lifts border to accent
- **System Status**: Two-column layout — left: `/04 JOIN THE RESISTANCE` CTA copy; center: `/05 SYSTEM STATUS` progress rows; right: `/06 SUBSCRIBE` email input + button
- **Email Input**: Mono label, `border-bottom: 1px solid var(--border)` only, `background: transparent`, `border-radius: 0`
- **Footer**: 4-column — logo + copyright · Navigation · Resources · Socials · Global Node map
- **Trusted By / Logo Row**: Full-width strip of monochrome partner logos, muted, horizontal rule above and below

---

## Imagery & Illustration

- No stock photography
- Hero visual: high-quality 3D render (pixelated cube, wireframe head, geometric form) — placed in right column, never full-bleed background
- Decorative elements: CSS geometry, SVG wireframes, dot-grid overlays, faint crosshatch patterns
- Works / project grid: solid color fill or blurred abstract image — never lifestyle photography

---

## Overall Replication Notes

- The system-data elements (SYS.TIME, coordinates, rendering %, SCN notation) are **structural**, not decorative — they live in the layout, not layered on top
- Sharp corners are absolute — any border-radius immediately breaks the aesthetic
- The accent color appears on interactive states, section numbers, progress fills, and status elements only — it is never used as a section background
- Crosshair `+` marks must appear in the hero and at a minimum of two other section edges
- The bottom status bar (`> ACCESS GRANTED_`) is as important as the header — it closes the loop on the "live system" aesthetic
- For dark mode, mix in at least one pure `#000000` section (not `--bg`) for contrast depth
- Every button, everywhere, must include a directional arrow icon — no text-only buttons
