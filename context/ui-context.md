# UI Context

## Theme

Use a clean, professional financial-dashboard style. Prefer light backgrounds, clear information hierarchy, restrained colors, and compact data presentation. Interactive elements should use a blue accent, while gains, losses, and warnings should use consistent semantic colors.

## Colors

All components must use CSS variables. Do not hardcode color values inside components.

| Role              | CSS Variable       | Value     |
| ----------------- | ------------------ | --------- |
| Page background   | `--bg-base`        | `#F8FAFC` |
| Surface           | `--bg-surface`     | `#FFFFFF` |
| Secondary surface | `--bg-subtle`      | `#F1F5F9` |
| Primary text      | `--text-primary`   | `#0F172A` |
| Muted text        | `--text-muted`     | `#64748B` |
| Primary accent    | `--accent-primary` | `#2563EB` |
| Accent hover      | `--accent-hover`   | `#1D4ED8` |
| Border            | `--border-default` | `#E2E8F0` |
| Error / loss      | `--state-error`    | `#DC2626` |
| Success / profit  | `--state-success`  | `#16A34A` |
| Warning           | `--state-warning`  | `#D97706` |

## Typography

| Role                    | Font       | Variable      |
| ----------------------- | ---------- | ------------- |
| UI text                 | Geist Sans | `--font-sans` |
| Financial values / mono | Geist Mono | `--font-mono` |

Use the monospace font for account balances, transaction amounts, percentages, and calculated financial values.

## Border Radius

| Context             | Class        |
| ------------------- | ------------ |
| Inline and small UI | `rounded-md` |
| Cards and panels    | `rounded-lg` |
| Modals and overlays | `rounded-xl` |

## Component Library

Use shadcn/ui on top of Tailwind CSS.

Generated shadcn/ui components live in `apps/web/src/components/ui/`. Add generated components using the shadcn CLI and do not modify generated components unless explicitly required. Build feature-specific wrappers inside the relevant feature folder.

## Layout Patterns

* Dashboard: fixed left sidebar, top header, and responsive content grid.
* Sidebar: collapsible on desktop and displayed as a drawer on mobile.
* Summary cards: use a responsive grid for balances and financial metrics.
* Tables: use full-width panels with filtering, pagination, and horizontal scrolling on mobile.
* Forms: use single-column layouts by default and two columns only on wider screens.
* Modals: use centered overlays for short actions and dedicated pages for complex forms.
* Charts: place charts inside bordered cards with titles, date filters, and clear legends.
* Mobile: stack cards and controls vertically and keep primary actions easily accessible.

## Icons

Use Lucide React icons only.

* Inline icons: `h-4 w-4`
* Buttons and navigation: `h-5 w-5`
* Empty states: `h-8 w-8`

Use stroke-based icons consistently. Do not mix icon libraries.

## Financial Display Rules

* Display profit and positive values using the success token.
* Display losses and negative values using the error token.
* Include `+` and `-` signs so meaning does not depend only on color.
* Align financial values to the right in tables.
* Use the user's selected currency consistently.
* Format large values with separators and no unnecessary decimal places.
