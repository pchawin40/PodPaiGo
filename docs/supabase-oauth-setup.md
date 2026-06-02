# Supabase Google OAuth setup

PodPaiGo uses **Supabase Auth** for Google sign-in. This is separate from Google Maps / Places API keys.

## 1. Environment variables

Add to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

For production, set `NEXT_PUBLIC_SITE_URL` to your public app URL (for example `https://podpaigo.com`).

Restart the dev server after changing env values.

## 2. Supabase Dashboard — enable Google provider

1. Open your Supabase project.
2. Go to **Authentication → Providers → Google**.
3. Enable the Google provider.
4. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Application type: **Web application**
   - Authorized redirect URI (required by Supabase):
     - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
5. Copy the Google **Client ID** and **Client Secret** into the Supabase Google provider settings.
6. Save provider settings.

## 3. Supabase Dashboard — redirect URLs

Go to **Authentication → URL Configuration** and add:

| Environment | Redirect URL |
|-------------|--------------|
| Local dev   | `http://localhost:3000/auth/callback` |
| Production  | `https://YOUR_DOMAIN/auth/callback` |

Also confirm **Site URL** matches your app base URL:

- Local: `http://localhost:3000`
- Production: `https://YOUR_DOMAIN`

## 4. Google Cloud Console checklist

In your OAuth client:

- **Authorized JavaScript origins**
  - `http://localhost:3000`
  - `https://YOUR_DOMAIN` (production)
- **Authorized redirect URIs**
  - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

Do **not** point Google redirect URIs at PodPaiGo directly. Supabase handles the Google exchange; PodPaiGo receives the session at `/auth/callback`.

## 5. Verify the flow

1. Visit `/login`.
2. Click **Continue with Google**.
3. Complete Google consent.
4. You should land on `/auth/callback`, then redirect to `/account` (or your original `?redirect=` path).

## 6. Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Redirect loop or `oauth_failed` on login | Confirm `NEXT_PUBLIC_SITE_URL` matches the browser origin |
| Google error: redirect_uri_mismatch | Add Supabase callback URL to Google OAuth client |
| Supabase error: redirect URL not allowed | Add `{SITE_URL}/auth/callback` in Supabase URL Configuration |
| Button does nothing | Confirm `NEXT_PUBLIC_SUPABASE_URL` and anon key are set |
| Signed in but redirected to `missing_code` | Usually fixed in app callback logic; ensure `/auth/callback` is allowed and you are on the latest build |
| Console: `Session as retrieved from URL was issued in the future` | Sync your machine/WSL clock (see below) |

### Device clock warning

Supabase may log:

> Session as retrieved from URL was issued in the future

This usually means your **local system clock is ahead of real time** (common in WSL or VMs). OAuth still may succeed, but token validation can behave oddly.

Fix:

- **Windows**: Settings → Time & language → Sync now
- **WSL**: `sudo hwclock -s` or enable Windows time sync for WSL
- Verify with `date` in both Windows and WSL terminals

After syncing, sign out and run Google sign-in again.

OAuth errors are shown on `/login` with friendly messages. Secrets are never exposed in the UI.

## 7. Future providers

The app uses a reusable OAuth provider list (`lib/auth/oauthProviders.ts`). Apple and Microsoft can be added later by enabling the provider in Supabase and setting `enabled: true` in that file.
