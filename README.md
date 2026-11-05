# RepBook

RepBook is a mobile-first, installable workout journal. The React/Vite app is hosted as static files on Vercel. Supabase provides email/password sign-in, an owner-only JSON snapshot table, and a private progress-photo bucket. IndexedDB keeps a device-local copy for offline workouts, measurements, and photos already opened on that device.

## Requirements

- Node.js 20 or newer
- pnpm 10.18.0 (`corepack enable` if pnpm is not installed)
- A Supabase project on the Free plan

## Supabase setup

1. Create a Supabase project. In **Project Settings → API**, copy the project URL and publishable/anon key; never put the service-role key in the browser.
2. Open **SQL Editor**, then run `supabase/migrations/202611010001_repbook.sql`. It creates the per-user snapshot table and merge RPC, enables row-level security, and creates a private photo bucket with owner-folder policies.
3. In **Authentication → URL Configuration**, add the Vercel production URL to the site URL and redirect allow list. Add preview URLs if you use them.
4. Enable email/password in **Authentication → Providers**. The app supports sign-up, sign-in, and password reset. Email confirmation follows the Supabase project's settings.

## Local development

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
pnpm dev
```

Run `pnpm check`, `pnpm test`, and `pnpm build` before publishing. Vercel's build output is `dist/`.

## Vercel deployment

Import this private repository into Vercel as a Vite project. The included `vercel.json` sets the install/build/output commands. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production, Preview, and Development, then deploy. Do not add `SUPABASE_SERVICE_ROLE_KEY`; this client-only app uses the public key with RLS policies.

## Data portability and migration

The app exports and imports RepBook JSON backups. Workout and measurement records are included in JSON. Progress-photo files are stored separately in the private bucket; download them individually before moving between accounts. The existing legacy account has a small tracker dataset and no progress-photo files. Keep its exported backup outside Git and import it only after signing in to the verified matching account.

## Profile and calorie estimates

Optional body weight (kg), height (cm), and age are stored in the local snapshot and the signed-in Supabase account's user metadata, and are included in JSON backups. The calorie estimate currently uses profile weight only when no weigh-in dated on or before the workout is available; height and age are saved but do not change the current MET-based estimate. Estimated values are approximate, not measured calorie expenditure.

## Offline behavior

After the first online visit, the installed PWA caches its shell and data locally. Workout, body-weight, and measurement edits work offline and sync when the user reconnects. Progress-photo uploads require a connection; photos opened on a device are cached locally for offline viewing. Clearing the browser's site data removes that device's offline cache, so keep a JSON backup.
