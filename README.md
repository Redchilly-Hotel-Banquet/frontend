# Red Chilly Frontend

Modern customer and administrator experience for Red Chilly Hotels, Restaurants & Banquet halls. The app is built with Vite, React, TypeScript, Tailwind CSS, shadcn/ui and TanStack Query, and communicates with the Red Chilly backend APIs for content, ordering and property management.

> **Repository URL**  
> https://github.com/Redchilly-Hotel-Banquet/frontend

## Prerequisites

- Node.js **18.0.0 or newer** (Vite 5 requires Node 18+). Node 20 LTS is recommended.
- npm 8+ (ships with recent Node releases). You can also use pnpm, yarn or bun if you prefer—examples below use npm.
- Access to a running Red Chilly backend API (see environment variables).

## 1. Clone the repository

```bash
git clone https://github.com/Redchilly-Hotel-Banquet/frontend.git
cd frontend
```

## 2. Configure environment variables

Create a `.env` file in the project root (same level as `package.json`). The app currently reads two variables:

```
# URL of the backend API (without trailing slash).
# Example: https://api.redchilly.in/api
VITE_API_BASE_URL=https://your-api-host/api

# Optional: base URL used when generating printable QR codes for rooms/tables.
# Falls back to the current browser origin if omitted.
VITE_PUBLIC_HOST_URL=https://your-frontend-host
```

> Use HTTPS URLs in production. When the variable is omitted, `VITE_API_BASE_URL` defaults to `http://localhost:4000/api` during local development.

## 3. Install dependencies

```bash
npm install
# or
# pnpm install
# yarn install
# bun install
```

## 4. Run the app in development mode

```bash
npm run dev
```

This starts Vite on [http://localhost:5173](http://localhost:5173) (it prints the exact address in the terminal). The dev server proxies requests directly to the backend specified in your `.env`.

## 5. Build for production

```bash
npm run build
npm run preview   # optional: serves the production build locally
```

The optimized output is written to the `dist/` directory.

## NPM Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Vite in development mode with hot reloading. |
| `npm run build` | Create an optimized production build. |
| `npm run build:dev` | Production build using the `development` Vite mode. |
| `npm run preview` | Preview the `dist/` build locally. |
| `npm run lint` | Run ESLint across the project. |
| `npm run backup` | Invoke `tsx ./db_data/backup_scripts/index.ts` (requires the companion backend tooling). |
| `npm run check-size` | Check database backup sizes (uses `db_data` scripts). |
| `npm run init-db` / `npm run delete-db` / `npm run seed-rooms-tables` | Utility scripts for database seeding (optional, requires matching backend setup). |

> The `db_data` scripts referenced above are optional helpers. They expect the backend database tooling that lives outside this repository.

## Project Structure Highlights

- `src/main.tsx` – React entry point that mounts the app.
- `src/App.tsx` – Sets up React Router routes, theme providers, toasts and the global TanStack Query client.
- `src/pages/` – Top-level routed pages for guests and administrators (e.g. `Menu`, `BookRoom`, `admin/ManageOrders`).
- `src/components/` – Shared UI primitives (ThemeProvider/Toggle) plus shadcn-derived components under `components/ui`.
- `src/lib/` – Client-side utilities such as the API client, session storage helpers for guests/admins, and Tailwind class helpers.
- `src/hooks/` – Custom hooks for admin access control, responsive helpers, and toast interactions.
- `public/` – Static assets (logos, fonts, audio, etc.) served as-is by Vite.
- `integrations/supabase/types.ts` – Generated Supabase type definitions for strongly typed database interactions.

## Functionality Reference

### Global Platform Features

- **Routing & state**: `src/App.tsx` wires up React Router with all guest/admin routes, a global TanStack Query client, and wraps the tree with the theme provider, tooltip provider, and toast stacks (`Toaster` + `Sonner`).
- **Theme & accessibility**: `src/components/ThemeProvider.tsx` and `ThemeToggle.tsx` provide light/dark switching with `next-themes`. UI primitives in `src/components/ui/` are shadcn/ui exports tailored for accessibility.
- **Data access**: `src/lib/apiClient.ts` centralizes REST calls, defaulting to `VITE_API_BASE_URL`, handles auth headers, and raises typed `ApiError`s. React Query handles caching, polling and retries throughout the app.
- **Session helpers**: `src/lib/guestSession.ts` stores QR-scanned guest context (room/table, outlet, booking metadata) in both sessionStorage and localStorage. `src/lib/authSession.ts` persists admin JWTs, roles and outlet assignments with auto-normalisation and scope helpers in `src/hooks/useAdminAccess.ts`.
- **Notifications**: `src/hooks/use-toast.ts` and `sonner` provide toasts for all flows (success/error/alerts). `src/components/ui/toaster.tsx` renders the queue.

### Guest-Facing Journey (`src/pages/`)

- **Home / Index (`Index.tsx`)**: Marketing landing page with hero, service highlights, testimonials, and CTAs for booking, check-in, menu, banquet enquiry, and order lookup. Tracks dismissed banners and guest session availability.
- **Menu & Ordering (`Menu.tsx`)**: Fetches menu categories/items per outlet, supports browse mode (no outlet) vs order mode (locked to a QR-scanned outlet), full-text search, category chips, veg badges, availability tags, cart management with sessionStorage persistence, order context summaries, and real-time guest order polling.
- **Checkout (`Checkout.tsx`)**: Receives cart state via navigation, displays cost breakdown, collects special instructions, validates guest session/outlet, clears cart and redirects to `OrderStatus` on successful `/public/orders` submission.
- **Live Order Status (`OrderStatus.tsx`)**: Polls `/public/orders/detail` every 5 seconds, renders timeline states (Pending → Finished) with icons, summarises ordered items, and surfaces errors or missing orders.
- **Guest Order History (`GuestOrders.tsx`)**: Shows active/past orders tied to the current booking, allows manual refresh, warns on checkout state, and provides a one-click session clear/reset for end of stay.
- **QR Scanner (`QRScanner.tsx`)**: Normalises `?room=…` / `?table=…` QR parameters, validates them against `/public/locations/validate`, persists location + booking metadata, handles missing bookings (room orders) and navigates to the menu, or surfaces invalid QR guidance.
- **Room Booking (`BookRoom.tsx`)**: Loads outlets, checks availability between selected dates, groups rooms by category, calculates rates/occupancy, handles quantity selection per category, optionally allows admins to override totals, and submits `/public/bookings`. Displays confirmation details post-booking.
- **Guest Check-In (`CheckIn.tsx`)**: Lets guests (or staff) fetch bookings by code/phone, capture arrival details, upload ID doc images (as data URLs), note special assistance, collect digital signatures, and submit check-in info. Also allows manual room assignment with outlet validation.
- **Banquet Enquiry (`BanquetEnquiry.tsx`)**: Lists branches, collects event metadata (date/time, guests, budget, notes) and opens a formatted `mailto:` message to the sales inbox.
- **Contact Us (`ContactUs.tsx`)**: Fetches outlet list, normalises addresses/contacts, displays cards with phone/email/WhatsApp, embeds Google Maps frames, and provides a quick enquiry form stub.
- **QR Onboarding & Misc**: `CheckIn.tsx`, `Checkout.tsx`, `GuestOrders.tsx` all leverage `guestSession` for continuity. `BookRoom.tsx` and `BanquetEnquiry.tsx` share branch selection logic. `NotFound.tsx` renders a friendly 404 fallback.

### Admin Console (`src/pages/admin/`)

- **Authentication (`AdminLogin.tsx`)**: Mutates `/auth/login`, stores JWT + user scopes, and redirects to the dashboard. Includes a demo password prompt for local testing.
- **Scoped Access Control (`Dashboard.tsx`)**: Displays admin tiles gated by role (`admin`, `rooms`, `kitchen`), surfaces logout, and links into each management screen.
- **Orders Command Center (`ManageOrders.tsx`)**: Polls `/admin/orders/manage`, plays escalating siren/HTML5 audio for unacknowledged new orders, keeps wake lock active, filters by outlet/status, supports bulk acknowledge, updates status transitions, and shows detailed order info cards.
- **Menu Management (`ManageMenuItems.tsx`)**: Lists items with search, veg/availability/outlet filters, sort options, inline badges, preview thumbnails, and a modal to create/edit/delete items (mapping form `price` → backend `base_price`). Pulls categories/outlets from validation endpoints.
- **Category Management (`ManageCategories.tsx`)**: Allows admins to CRUD categories with outlet linkage, descriptions, sort order, and activation toggles through a modal interface.
- **Rooms & Tables (`ManageRooms.tsx`)**: Full CRUD with type filters (room/table), outlet filters, search, pagination, occupancy & amenities editing, QR code generation (white-labeled PNGs, clipboard copy, per-room or bulk ZIP download via `JSZip`), pricing rules (percent/fixed adjustments with date ranges), and stay extensions via booking lookups.
- **Bookings & Check-Ins (`ManageBookings.tsx`)**: Shows booking table with status chips, outlet filter, search, new-booking creation dialog, status updates, room assignment workflows, billing summary fetch, stay extension simulator, inline total edits, digital signature capture, and check-in modal mirroring guest form plus room allocation toggles.
- **Branch Directory (`ManageBranches.tsx`)**: Syncs with public outlets, enforces admin outlet access, supports search/status filter, and offers modal-based create/edit/delete of branch metadata (contact info, maps, sorting, active flag) with optimistic toasts.
- **Analytics (`Analytics.tsx`)**: Aggregates branch metrics via `/admin/analytics/outlets`, offers search/sort tabs, summary KPIs, revenue/order/bookings charts (Bar + Pie via `recharts`), outlet detail sheets, and CSV export.
- **Room Bookings Assistant (`BookRoom.tsx` in admin context)**: Admins with `rooms`/`admin` scopes get pricing override fields, category metadata, and rate adjustments when using the same flow as guests.

### Supporting Modules & Assets

- **Hooks**: `useAdminAccess.ts` guards private routes, normalises scopes/outlets, and redirects unauthorized users. `useIsMobile.tsx` and `use-toast.ts` provide responsive detection and toast management respectively.
- **Assets**: `public/alarm.wav` powers the kitchen siren; `public/logo.jpeg` is embedded in QR posters generated from `ManageRooms`.
- **Supabase Types**: `integrations/supabase/types.ts` documents backend table shapes (menu items, orders, bookings, outlets) for stronger typing in API integrations.

## API & Data Dependencies

- **REST API**: All data comes from the Red Chilly backend. Ensure the API is reachable and CORS allows the frontend domain.
- **Authentication**: Admin dashboard pages rely on JWT tokens persisted via `src/lib/authSession.ts`. Guests rely on QR-scanned sessions persisted via `src/lib/guestSession.ts`.
- **Supabase**: The project includes generated Supabase typings but does not instantiate the client directly; the backend bridges Supabase/Postgres data via REST endpoints.

## Linting & Formatting

The project uses ESLint (configured in `eslint.config.js`) with TypeScript, React, and hooks rules. Run `npm run lint` to validate code style. Tailwind CSS is configured via `tailwind.config.ts`, and component styles reside in `src/index.css` / `src/App.css`.

## Deployment Notes

1. Build the project (`npm run build`).
2. Upload the `dist/` directory to your hosting provider (Vercel, Netlify, static hosting, etc.) or serve it behind a Node/Edge runtime.
3. Configure environment variables (`VITE_API_BASE_URL`, `VITE_PUBLIC_HOST_URL`) in your hosting provider dashboard.
4. Ensure the backend allows the deployed origin and serves all required API endpoints.

## Troubleshooting

- **Blank data or 401 errors**: Verify `VITE_API_BASE_URL`, backend availability, and admin login credentials.
- **QR-based features not working**: Confirm `VITE_PUBLIC_HOST_URL` points to the public frontend origin so generated QR codes resolve correctly.
- **Audio alarms (kitchen view) not sounding**: Browsers require user interaction before playing audio. Click “Enable sound” when prompted in the Manage Orders screen.

Happy hacking!
