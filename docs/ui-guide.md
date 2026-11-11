# UI Guide

Based on the supplied dark dashboard reference (see the original image you shared; save a copy in the repo under `docs/reference.png`).

## Look and feel
- Dark navy background, slightly lighter navy cards with a thin border and rounded corners
- Cyan and magenta as the two accent colours
- Green and red small pill badges for up/down trends
- Left sidebar with logo, search box, grouped navigation, and the account at the bottom
- Top bar with a welcome heading, short subtitle, an ghost "Export" button, and a magenta primary "Create" button

## Design tokens (starting values for `theme.css`)
Tune these by eye against the reference.
```css
:root {
  --bg: #070d24;
  --surface: #0b1433;
  --surface-2: #0f1a40;
  --border: #1b2a5a;
  --text: #ffffff;
  --text-muted: #9aa6c7;
  --accent-cyan: #22c3ff;
  --accent-magenta: #d63cff;
  --up-bg: rgba(34, 197, 94, 0.15);
  --up-text: #34d399;
  --down-bg: rgba(239, 68, 68, 0.15);
  --down-text: #f87171;
  --radius: 10px;
  --radius-sm: 6px;
  --font: "Inter", system-ui, sans-serif;
}
```

## Reference-to-inventory mapping
| Reference element | Inventory version |
|---|---|
| Pageviews card | Total products |
| Monthly users card | Stock value |
| New sign ups card | Low-stock items |
| Subscriptions card | Expiring soon |
| Total revenue area chart | Stock received vs sold per month |
| Total profit bar chart | Movements per day |
| Total sessions line chart | Expiring batches list (or trend of issues) |
| Sidebar: Dashboard, All pages, Reports, Products, Task | Dashboard, Products, Stock, Expiry, Partners, Reports |
| Sidebar: Features, Users, Pricing, Integrations | Users, Settings |

## Screens
1. **Login**
2. **Dashboard:** 4 KPI cards, area chart, bar chart, expiring-soon panel
3. **Products:** table with search, low-stock filter, add/edit drawer, CSV import dialog, detail page with movement history
4. **Stock:** receive form, issue form (shows FEFO batches picked), adjust dialog
5. **Expiry:** tabs for 30, 60, and 90 days
6. **Reports:** low stock, valuation
7. **Users and Settings** (owner only)

## Shared components
`Card`, `Badge` (up/down), `Button` (primary, ghost), `Sidebar`, `TopBar`, `KpiCard`, `DataTable`, `Drawer`, `Dialog`, `Tabs`, `Skeleton`, `EmptyState`, `Toast`, `BarcodeScanner`.

## UX rules
- Skeleton loaders on every data panel.
- A friendly "Waking up the server..." message if a request takes longer than about 3 seconds (cold start).
- Batch and expiry fields appear only for products with `track_batches` on.
- Expiry colours: red if expired or under 30 days, amber under 60, neutral otherwise.
- Low-stock rows get a red badge.
- Mobile: sidebar collapses to a bottom bar; tables become cards; scan button is prominent on Receive and Issue.
- Product images are displayed with Cloudinary `f_auto,q_auto,w_400`.
- Respect the dark theme only for the MVP; a light theme is optional later.
