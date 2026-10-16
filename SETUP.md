# Viget Bingo: setup

React (Vite) app hosted on Vercel, with Supabase for sign-in, data and photo storage.

```
src/game/tasks.ts       ← the 24 prompts, tile artwork mapping, scoring, board shuffle
src/backend/            ← Supabase client (and a demo backend used when no keys are set)
src/components/         ← screens: board, task list, leaderboard, organizer, sheets, sign-in
supabase/schema.sql     ← tables, security rules, leaderboard, photo bucket, seed data
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
   - This creates the private `photos` storage bucket.
   - It also makes **abby.smith@viget.com** an organizer. To add more organizers, edit the last `insert` in the file, or run `insert into organizers (email) values ('someone@viget.com');`.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

## 2. Google sign-in (≈5 min)

1. In Google Cloud (signed in as your @viget.com account), create or pick a project.
2. **APIs & Services → OAuth consent screen**: choose **Internal**. This limits sign-in to Viget accounts.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. In Supabase: **Authentication → Sign In / Providers → Google**. Turn it on and paste the client ID and secret.
5. In Supabase: **Authentication → URL Configuration**
   - Site URL: your Vercel URL (e.g. `https://ttt26secret.vercel.app`)
   - Redirect URLs: add `http://localhost:5173` and `https://*.vercel.app/**`

## 3. Vercel (≈5 min)

1. In Vercel, choose **Add New → Project** and import the `ttt26secret` GitHub repo. Vercel detects Vite automatically.
2. **Settings → Environment Variables**: add

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

3. Redeploy. For local development, put the same two values in `.env.local`.

## 4. Test before launch

1. Sign in with your Viget account → pick your name.
2. Answer a blue square → the tile fills in → the leaderboard shows 50.
3. Upload a photo to an orange square → the leaderboard goes up by 200.
4. Leaderboard → **organizer: see all photos** → the photo appears under its task.
5. Tap **download all photos**. You get a zip with one folder per task, e.g. `01 Album cover/Abby – Abbey Road.jpg`.

## Where photos live

- **Storage:** Supabase → **Storage → photos**, in a private bucket with one folder per player.
  - Each upload saves a full-size copy (≈1 MB) and a small preview.
  - A re-upload replaces the old photo.
  - The free tier includes 1 GB, which is plenty for this group.
- **Who can see them:** players can only see their own photos. Organizers see everyone's, on the organizer page (linked from the bottom of the leaderboard).
- **Keeping them:** to keep the photos in Google Drive after the event, use **download all photos**, unzip, and drag the folders into Drive.

## Changing things later

- **Prompts, artwork or scoring:** edit `src/game/tasks.ts`. If you change scoring, also update `public.leaderboard()` in `schema.sql` and re-run it.
- **People:** `insert into people (name, sort) values ('New Person', 12);` in the SQL editor.
- **Someone picked the wrong name:** in **Table Editor → players**, change their `person_id` to the right person. (Deleting the row also deletes their answers.)
- **Allowed email domain:** `src/config.ts` and `is_allowed_user()` in `schema.sql`.
