# Yelli — Design System

## Design Identity

**Aesthetic:** ClickHouse-inspired — warm yellow accent on white matte surfaces. Clean, technical, professional. Designed for hospital and government office environments where clarity and speed matter more than decoration.

**Design principles:**
1. **Clarity over cleverness** — every element serves a purpose. No decorative gradients, no abstract illustrations. If a nurse is looking for the ER button at 2am, it needs to be unmissable.
2. **Touch-first** — all interactive elements are designed for touch screens (wall-mounted tablets, phones) before mouse. Minimum touch target: 44×44px, preferred: 48×48px.
3. **Generous whitespace** — cards breathe. Sections separate. Dense data (tables, logs) still gets 12-16px cell padding.
4. **Progressive density** — speed dial board is sparse and large. Admin dashboards are denser. Both use the same tokens.

---

## Color Tokens

### Primary Palette

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `accent` | `#FACC15` | `yellow-400` | Primary action buttons, active states, progress bars, chart highlights, speed dial button gradient start |
| `accent-hover` | `#EAB308` | `yellow-500` | Hover/pressed states, gradient end, link text, secondary emphasis |
| `accent-light` | `#FEF9C3` | `yellow-100` | Active nav background tint, inactive chart bars, badge backgrounds, tag fills |
| `accent-glow` | `rgba(250,204,21,0.25)` | — | Box-shadow glow on active speaker tiles, focused elements |

### Neutral Palette (Zinc scale)

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `bg` | `#FAFAF9` | `stone-50` | Page background — warm off-white matte |
| `bg-card` | `#FFFFFF` | `white` | Card surfaces, table backgrounds, controls bar, chat sidebar |
| `bg-sidebar` | `#18181B` | `zinc-900` | Sidebar background — dark contrast |
| `bg-dark` | `#0C0C0E` | — | NOT USED in current design (all pages are white matte) |
| `text` | `#18181B` | `zinc-900` | Primary text — headings, body, table cells |
| `text-secondary` | `#71717A` | `zinc-500` | Secondary text — descriptions, sub-labels |
| `text-muted` | `#A1A1AA` | `zinc-400` | Tertiary text — timestamps, mono labels, disabled text |
| `text-on-dark` | `#FAFAF9` | `stone-50` | Text on dark sidebar |
| `text-on-accent` | `#18181B` | `zinc-900` | Text on yellow buttons/badges |
| `border` | `#E4E4E7` | `zinc-200` | Card borders, table dividers, input borders, separator lines |
| `border-dark` | `rgba(255,255,255,0.1)` | — | Borders inside dark sidebar only |

### Semantic Colors

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `green` | `#22C55E` | `green-500` | Online status dot, completed status, positive metrics, success states |
| `green-glow` | `rgba(34,197,94,0.3)` | — | Glow ring around online speed dial buttons, connected call overlay |
| `red` | `#EF4444` | `red-500` | End call button, recording indicator, missed/failed status, destructive actions, error states |
| `amber` | `#F59E0B` | `amber-500` | In-call status dot, warning states, approaching-limit alerts |
| `blue` | `#3B82F6` | `blue-500` | Auto-answer badge, meeting type tag, info states, links in dark contexts |
| `gray` | `#A1A1AA` | `zinc-400` | Offline status dot, disabled elements |

### Color Usage Rules
- **NEVER** use `accent` (yellow) for text on white backgrounds — insufficient contrast. Use `accent-hover` (#EAB308) for text links/labels.
- **NEVER** use pure black `#000000` — always use `text` (#18181B) which is warm near-black.
- **ALWAYS** pair status dots with text labels — color alone is not accessible.
- **Sidebar is the only dark surface** — all other UI surfaces use the white matte palette.

---

## Typography

### Font Stacks

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `font-sans` | `"Inter", system-ui, -apple-system, sans-serif` | `font-sans` (configure in tailwind.config) | All UI text — headings, body, labels, buttons |
| `font-mono` | `"JetBrains Mono", "Fira Code", "Courier New", monospace` | `font-mono` (configure in tailwind.config) | Section labels, timestamps, status tags, metrics units, technical metadata |

### Google Fonts Import
```
Inter: 300, 400, 500, 600, 700, 800
JetBrains Mono: 400, 500, 600
```

### Type Scale

| Element | Size | Weight | Font | Letter-spacing | Tailwind |
|---------|------|--------|------|----------------|----------|
| Page title (h1) | 26px | 700 | sans | -0.5px | `text-2xl font-bold tracking-tight` |
| Section title (h2) | 14-16px | 500-600 | sans | 0 | `text-sm font-semibold` or `text-base font-medium` |
| Body text | 13px | 400 | sans | 0 | `text-[13px]` |
| Small body | 12px | 400-500 | sans | 0 | `text-xs` |
| Section label (overline) | 9-10px | 500-600 | mono | 0.1em | `text-[10px] font-medium tracking-widest uppercase font-mono` |
| Status tag | 9-10px | 600-700 | mono | 0.05-0.08em | `text-[9px] font-semibold tracking-wide uppercase font-mono` |
| Stat value (large number) | 30-32px | 700 | sans | -0.8px | `text-3xl font-bold tracking-tight` |
| Stat label | 10-11px | 500 | mono | 0.05em | `text-[10px] font-medium tracking-wide uppercase font-mono` |
| Table header | 9-10px | 500-600 | mono | 0.08em | `text-[9px] font-medium tracking-widest uppercase font-mono` |
| Table cell | 12-13px | 400-500 | sans | 0 | `text-xs` or `text-[13px]` |
| Button label | 12-14px | 500-600 | sans | 0 | `text-xs font-medium` or `text-sm font-semibold` |
| Nav item | 13px | 400 (inactive) / 600 (active) | sans | 0 | `text-[13px]` |
| Logo text | 18px | 700 | sans | -0.5px | `text-lg font-bold tracking-tight` |
| Sidebar section label | 9px | 600 | mono | 0.1em | `text-[9px] font-semibold tracking-[0.1em] uppercase font-mono` |
| Timestamp | 9-10px | 400 | mono | 0 | `text-[9px] font-mono` |

### Typography Rules
- **Page titles** always have a mono overline label above them (e.g., "INTERCOM BOARD" above "Speed Dial").
- **Mono font is structural, not decorative** — it signals metadata, technical values, status labels. Never use mono for prose or descriptions.
- **Negative letter-spacing** only on large text (≥18px). Positive tracking only on uppercase mono labels.

---

## Spacing System

### Page-Level Spacing

| Context | Value | Tailwind |
|---------|-------|----------|
| Page padding (desktop) | 32px | `p-8` |
| Page padding (mobile) | 16px | `p-4` |
| Section gap (vertical) | 24-28px | `space-y-6` or `space-y-7` |
| Header to content gap | 28px | `mb-7` |

### Component Spacing

| Context | Value | Tailwind |
|---------|-------|----------|
| Card padding | 20px | `p-5` |
| Card padding (large/speed dial) | 28px | `p-7` |
| Card grid gap | 16px | `gap-4` |
| Card grid gap (sparse/speed dial) | 24px | `gap-6` |
| Table cell padding | 12-14px horizontal, 10-12px vertical | `px-4 py-3` |
| Table header padding | 10px horizontal, 10px vertical | `px-4 py-2.5` |
| Button padding | 8-12px vertical, 16-36px horizontal | `py-2 px-4` to `py-3 px-9` |
| Input padding | 10px vertical, 14px horizontal | `py-2.5 px-3.5` |
| Sidebar nav item padding | 8px vertical, 10px horizontal | `py-2 px-2.5` |
| Badge/tag padding | 2-3px vertical, 6-8px horizontal | `py-0.5 px-2` |
| Inline element gap | 4-8px | `gap-1` to `gap-2` |
| Stat card: label to value gap | 12px | `mb-3` |

---

## Border Radius

| Element | Value | Tailwind |
|---------|-------|----------|
| Cards (standard) | 12px | `rounded-xl` |
| Speed dial card | 16px | `rounded-2xl` |
| Speed dial button (circle) | 50% | `rounded-full` |
| Buttons (standard) | 8-10px | `rounded-lg` |
| Buttons (pill/cancel) | 50px | `rounded-full` |
| Input fields | 8-10px | `rounded-lg` |
| Tags/badges | 6px | `rounded-md` |
| Auto-answer pill badge | 10px | `rounded-[10px]` |
| Sidebar nav item | 6px | `rounded-md` |
| Logo icon | 8px | `rounded-lg` |
| Avatar (circle) | 50% | `rounded-full` |
| Status dot | 50% | `rounded-full` |
| Chart bars | 4-6px | `rounded` or `rounded-md` |
| Table container | 12px | `rounded-xl` |
| Video PIP (self-view) | 12px | `rounded-xl` |
| Participant tile | 12px | `rounded-xl` |

---

## Shadows

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `shadow-sm` | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | `shadow-sm` | Cards, table containers, control buttons |
| `shadow-md` | `0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.03)` | `shadow` | PIP video view, remote label pill, elevated cards |
| `shadow-lg` | `0 10px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04)` | `shadow-lg` | Remote video avatar placeholder, modal overlays |
| `shadow-button` | `0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.15)` | Custom | Speed dial round buttons — 3D pressable effect |
| `shadow-button-pressed` | `0 2px 4px rgba(0,0,0,0.1), inset 0 2px 4px rgba(0,0,0,0.1)` | Custom | Speed dial button active/pressed state |
| `shadow-up` | `0 -2px 8px rgba(0,0,0,0.03)` | Custom | Bottom-anchored controls bar |

### Shadow Rules
- **All cards get `shadow-sm`** — provides subtle lift from the warm off-white background.
- **Speed dial buttons get `shadow-button`** — the 3D inset highlight + outer shadow creates the pressable appearance.
- **Online speed dial buttons also get the green `glow` animation** as an additional box-shadow layer.

---

## Animations

| Name | Keyframes | Duration | Usage |
|------|-----------|----------|-------|
| `fadeInUp` | opacity 0→1, translateY 16px→0 | 0.4s ease | Card entrance, staggered with `i * 0.04s` delay per item |
| `fadeIn` | opacity 0→1 | 0.2s ease | Overlay entrance (ringing, connected) |
| `pulse` | opacity 1→0.4→1 | 1.2-1.5s infinite | Recording dot, ringing text |
| `ringPulse` | box-shadow 0→30px→0 (yellow glow) | 1.2s infinite | Ringing call button overlay |
| `glow` | box-shadow 8px→20px→8px (green glow) | 2s ease-in-out infinite | Online speed dial button ring |
| `autoAnswerPulse` | box-shadow 0→8px→0 (blue glow) | 2s infinite | Auto-answer ⚡ badge |
| `slideIn` | opacity 0→1, translateX 20px→0 | 0.2s ease | Chat sidebar opening |
| `waveform` | height 6px→22px→6px | 0.6-0.8s ease infinite | Audio speaking indicator bars, staggered per bar |
| `buttonPress` | scale 1→0.92→1 | 0.15s | Speed dial button tap feedback |

### Animation Rules
- **Stagger card entrances** — each card delays by `index * 0.04s` for the cascade effect.
- **Speaking waveform bars** stagger by `index * 0.08s` — 5 bars total, each 2-3px wide.
- **NEVER animate on `prefers-reduced-motion: reduce`** — all animations should respect this media query.

---

## Component Patterns

### Speed Dial Button (Intercom)

```
Structure:
┌─────────────────────────────┐  Card: rounded-2xl, bg-white, shadow-sm
│  [1F]              mono tag │  Floor tag: 10px mono, text-muted
│                             │
│      ┌───────────┐          │  Round button: 90-140px, rounded-full
│      │  ⚡ badge │          │  Gradient: accent → accent-hover
│      │           │          │  Shadow: shadow-button (3D)
│      │    📞     │          │  Green ring: glow animation (if online)
│      │           │          │  ⚡ badge: 24px circle, blue, top-right
│      └───────────┘          │
│                             │
│     Department Name         │  Name: 13-15px, font-semibold
│     1F · ● Online           │  Floor + status: 10px mono
│     AUTO-ANSWER             │  Auto badge: 9px mono, blue, pill bg
└─────────────────────────────┘

States:
- Online:  yellow gradient, green glow ring, clickable
- In-call: amber gradient, no glow, clickable (shows "In Call")
- Offline: gray gradient, opacity 0.45, cursor not-allowed
```

### Stat Card

```
Structure:
┌─────────────────────────────┐  Card: rounded-xl, bg-white, shadow-sm, p-5
│ LABEL              icon 📞  │  Label: 10px mono, text-muted, uppercase
│                             │
│ 47                          │  Value: 30px, font-bold, tracking-tight
│ +12% vs yesterday           │  Change: 11px mono, green (positive) / red (negative)
└─────────────────────────────┘

Grid: 4 columns on lg:, 2 on sm:, 1 on base (mobile first)
```

### Data Table

```
Structure:
┌──────────────────────────────────────────────┐  Container: rounded-xl, bg-white, shadow-sm
│ Section Title                    View all →   │  Header: p-4, border-bottom
│ SUBTITLE (mono)                              │
├──────────────────────────────────────────────┤
│ COLUMN    COLUMN    COLUMN    COLUMN         │  Headers: 9px mono, uppercase, tracking-widest
├──────────────────────────────────────────────┤
│ Cell      Cell      Tag       Cell           │  Cells: 12-13px sans
│ Cell      Cell      Tag       Cell           │  Rows: border-bottom zinc-200 at 13% opacity
└──────────────────────────────────────────────┘

Mobile: each row becomes a stacked card with label:value pairs
```

### Status Tag/Badge

```
Types:
[INTERCOM]  → bg: accent-light, text: accent-hover, 9px mono bold
[MEETING]   → bg: blue/8%, text: blue, 9px mono bold
[AUTO]      → bg: blue/8%, text: blue, 8-9px mono bold
[COMPLETED] → text: green, 9px mono bold (no background)
[MISSED]    → text: red, 9px mono bold (no background)
[HOST]      → bg: accent-light, text: accent-hover, 9px mono bold
[ENTERPRISE]→ bg: accent/12%, text: accent-hover, 9px mono bold
[PRO]       → bg: blue/8%, text: blue, 9px mono bold
[FREE]      → bg: black/4%, text: text-muted, 9px mono bold

All tags: padding 3px 8px, rounded-md, font-semibold, uppercase, tracking-wide
```

### Video Call Controls Bar

```
Structure (bottom-anchored):
┌──────────────────────────────────────────────────────┐
│  [🎤] [📹] [🖥️] [📎] [🎨] [💬]        [End Call]   │
└──────────────────────────────────────────────────────┘

Button: 48×48px, rounded-xl, border 1px border
- Inactive: bg-white, border-zinc-200, shadow-sm
- Active: bg-accent-light, border-accent-hover
End call: red bg, white icon, wider (64px), shadow with red glow

Bar: bg-white, border-top zinc-200, shadow-up, py-3.5 px-6
Mobile: full-width, buttons evenly spaced, touch targets ≥48px
```

### Sidebar

```
Structure:
- Collapsed (default): 60px wide, icon-only
- Expanded (on toggle): 220px wide, icon + label
- Background: zinc-900 (#18181B)
- Logo: 32px yellow gradient square with "Y", rounded-lg
- Section labels: 9px mono, uppercase, zinc-400
- Nav items: 13px sans, zinc-400 (inactive) / yellow-400 (active)
- Active nav: bg yellow/12%, text yellow-400, font-semibold
- User avatar: 30px circle, yellow gradient, bottom-pinned
- Transition: width 0.2s ease
```

---

## Responsive Breakpoints

| Breakpoint | Width | Tailwind | Layout changes |
|------------|-------|----------|----------------|
| Base (mobile) | 0-639px | — | Single column. Sidebar hidden (hamburger). Speed dial: 1 column of large buttons. Tables become card lists. Stats: 1 column. Chat: full-screen overlay. |
| `sm` | 640px | `sm:` | Speed dial: 2 columns. Stats: 2 columns. |
| `md` | 768px | `md:` | Tables switch to horizontal layout. Speed dial: 3 columns. Charts appear inline. |
| `lg` | 1024px | `lg:` | Sidebar visible (collapsed icon-only). Speed dial: 3-4 columns adaptive. Stats: 4 columns. Side panels (chat) appear as sidebar. |
| `xl` | 1280px | `xl:` | Full desktop layout. Max content width. Comfortable spacing. |

### Mobile-First Rules
- Base styles (no prefix) target 375px phone
- `sm:` adds minor enhancements (2-col grids)
- `md:` adds tablet layouts (horizontal tables, 3-col)
- `lg:` adds sidebar and desktop density
- `xl:` adds max-width constraints and generous whitespace

---

## Icon System

| Library | Usage |
|---------|-------|
| `lucide-react` | Primary icon set — all UI icons (search, settings, chevrons, etc.) |
| Emoji | Speed dial department buttons (📞), control bar buttons, stat card decorators. Used because they render universally on wall-mounted tablets and kiosks without icon font loading. In production, replace with lucide-react icons for consistency. |

### Icon Sizing

| Context | Size |
|---------|------|
| Speed dial button icon | 32% of button diameter (28-45px) |
| Control bar button icon | 19px |
| Nav item icon | 15px |
| Stat card decorator | 18-26px |
| Status dot | 6-8px (circle div, not icon) |

---

## Dark Mode

**Not supported in v1.** The design is light-only with a dark sidebar. All CSS variables and Tailwind classes assume light mode. The `prefers-color-scheme` media query is not used for theming — only for `prefers-reduced-motion`.

---

## Tailwind Config Overrides

```js
// tailwind.config.ts — relevant overrides for Yelli design system
{
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Courier New"', 'monospace'],
      },
      colors: {
        accent: {
          DEFAULT: '#FACC15',
          hover: '#EAB308',
          light: '#FEF9C3',
          glow: 'rgba(250,204,21,0.25)',
        },
        status: {
          green: '#22C55E',
          red: '#EF4444',
          amber: '#F59E0B',
          blue: '#3B82F6',
        },
      },
      boxShadow: {
        'button-3d': '0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.15)',
        'button-pressed': '0 2px 4px rgba(0,0,0,0.1), inset 0 2px 4px rgba(0,0,0,0.1)',
        'up': '0 -2px 8px rgba(0,0,0,0.03)',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-green': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(34,197,94,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(34,197,94,0.5)' },
        },
        waveform: {
          '0%, 100%': { height: '6px' },
          '50%': { height: '22px' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.4s ease both',
        'glow-green': 'glow-green 2s ease-in-out infinite',
        waveform: 'waveform 0.6s ease infinite',
      },
    },
  },
}
```

---

## File Reference

| File | Purpose |
|------|---------|
| `docs/PRODUCT.md` | Product spec — features, roles, data entities, URLs, tech stack |
| `docs/DESIGN.md` | This file — design tokens, typography, spacing, component patterns |
| `docs/YELLI_BUSINESS_MODEL.md` | SaaS pricing, revenue projections, competitor analysis |
| `yelli-mockup-v2.jsx` | Interactive mockup — source of truth for all design tokens in this file |
