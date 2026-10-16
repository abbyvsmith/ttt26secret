# Viget Bingo: setup

React (Vite) app hosted on Vercel, with Supabase for sign-in and data, and Google Drive for photo storage.

```
src/game/tasks.ts       ← the 24 prompts, tile artwork mapping, scoring, board shuffle
src/backend/            ← Supabase client (and a demo backend used when no keys are set)
src/components/         ← screens: board, task list, leaderboard, sheets, sign-in
api/submit-photo.ts     ← Vercel function: copies a photo into Google Drive
supabase/schema.sql     ← tables, security rules, leaderboard, seed data
```

## Try it now (demo mode)

```bash
npm install
npm run dev
```

With no keys in `.env.local`, the app runs in **demo mode**: sign-in is faked, data is saved in your browser, and the leaderboard has a few pretend players.

---

## 1. Supabase (≈10 min)

1. Create a project at supabase.com (the free tier is fine).
2. **SQL Editor → New query**: paste all of `supabase/schema.sql` and run it.
3. **Project Settings → API**: copy the **Project URL**, the **anon public** key and the **service_role** key. You'll need them in step 4.

## 2. Google Cloud (≈20 min)

Use one Google Cloud project, created while signed in as your @viget.com account.

**a. Sign-in (OAuth)**
1. **APIs & Services → OAuth consent screen**: choose **Internal**. This limits sign-in to Viget Google accounts on Google's side.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. In Supabase: **Authentication → Sign In / Providers → Google**. Turn it on and paste the client ID and secret.
4. In Supabase: **Authentication → URL Configuration**
   - Site URL: your Vercel URL (e.g. `https://viget-bingo.vercel.app`)
   - Redirect URLs: add `http://localhost:5173` and `https://*.vercel.app/**`

**b. Drive uploads (service account)**
1. **APIs & Services → Library**: enable the **Google Drive API**.
2. **IAM & Admin → Service accounts → Create**. No roles are needed. Open it → **Keys → Add key → JSON** to download the key file.
   - If key creation is blocked by an org policy (`iam.disableServiceAccountKeyCreation`), ask IT to allow it for this project.
3. In Google Drive, create a **Shared Drive** (a service account can't store files in a personal My Drive).
   Add the service account's email (`…@….iam.gserviceaccount.com`) as a **Content manager**.
4. Create a folder in that Shared Drive (e.g. "Viget Bingo Photos"). The last part of its URL is the **folder ID**.

Photos are stored like this:
```
Viget Bingo Photos/
  01 Album cover/      Abby – Abbey Road – 2026-10-16 14.32.jpg
  02 Viget logo/       Andrew – 2026-10-16 15.01.jpg
  …
```
Each file's description records the player, their email and the task. A re-upload sends the old file to Drive's trash, where it can be recovered for 30 days.

## 3. GitHub + Vercel (≈10 min)

```bash
git init && git add -A && git commit -m "Viget Bingo"
```
Push to a new GitHub repo, then in Vercel use **Add New → Project** to import it. Vercel detects Vite automatically.

## 4. Environment variables

Add these in Vercel → **Settings → Environment Variables**, and in `.env.local` for local development (see `.env.example`):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_URL` | Same Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (**server only**) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Entire contents of the JSON key file |
| `GOOGLE_DRIVE_FOLDER_ID` | Folder ID from step 2b |

Redeploy after adding them.

Local development with photo uploads: `npm run dev` only serves the front end. To also run `/api/submit-photo` locally, use `npx vercel dev`.

## 5. Test before launch

1. Sign in with your Viget account → pick your name.
2. Answer a blue square → the tile fills in → the leaderboard shows 50.
3. Upload a photo to an orange square → it appears in the right Drive subfolder → the leaderboard goes up by 200.
4. Re-upload the same square → the old Drive file moves to the trash.

## Changing things later

- **Prompts, artwork or scoring:** edit `src/game/tasks.ts`. If you change scoring, also update `public.leaderboard()` in `schema.sql` and re-run it.
- **People:** `insert into people (name, sort) values ('New Person', 12);` in the SQL editor.
- **Someone picked the wrong name:** in **Table Editor → players**, change their `person_id` to the right person. (Deleting the row also deletes their answers.)
- **Allowed email domain:** `src/config.ts`, `api/submit-photo.ts` and `is_allowed_user()` in `schema.sql`.
