# Going live on Vercel

The app is one Next.js project. Vercel builds it straight from GitHub (`victorvisualdesigner/It-Party-Invite`, branch `main`). Every push to `main` deploys again.

## Before the first deploy

- Both database migrations have run in Supabase. These are `supabase/migrations/20261016000000_init.sql` and `20261017000000_guest_flow.sql`.
- In Supabase, go to Authentication > Sign In / Providers > Email and turn off "Allow new users to sign up". Only the seeded admin should ever sign in.
- Add the payout account and fill in Event settings in the admin portal. Guests see these.

## Plan

Vercel's free Hobby plan is for personal, non-commercial use. A paid event counts as commercial, so use a Pro team, or another host whose terms allow it. Hobby also limits scheduled jobs to once a day. That is fine here: invites expire on every read, and the daily sweep in `vercel.json` only tidies up.

## Steps

1. Sign in at vercel.com with the `victorvisualdesigner` GitHub account.
2. Choose **Add New > Project** and import `It-Party-Invite`. Vercel detects Next.js. Keep the default build settings: `npm run build` also builds the guest page assets.
3. Open **Environment Variables**, paste the contents of `.env.local`, and then:
   - Set `APP_URL` to the address the site will use, with no trailing slash, e.g. `https://it-party-invite.vercel.app`, or your own domain once it is connected. Invite links and member key messages are built from this value.
   - Delete `SUPABASE_DB_URL` if it is there. Only local scripts use it.
4. Deploy.
5. Once it is live, open `/admin/login` and sign in.
6. Send one real invite to your own number. Open it inside WhatsApp, and check that the link preview shows the sealed envelope.

## Custom domain (optional)

In Vercel, go to Project > Settings > Domains, add the domain and follow the DNS steps. Then change `APP_URL` to the new address and redeploy. Links that already went out keep pointing at the old address, and Vercel keeps serving it.

## Environment variables

| Name | What it is |
| --- | --- |
| `SUPABASE_URL` | Project URL from Supabase, under Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key. Server only, never shown in the browser |
| `SUPABASE_ANON_KEY` | Publishable key, used on the server for admin sign in |
| `APP_URL` | The live address, used to build links |
| `SESSION_SECRET` | 32 or more random bytes |
| `CRON_SECRET` | Protects `/api/cron/expire`. Vercel Cron sends it automatically |
