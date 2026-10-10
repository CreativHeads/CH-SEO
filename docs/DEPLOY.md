# Deploy SEO Studio online (GitHub → Vercel + Supabase)

Online, SEO Studio runs on **Vercel** (the website and API) with **Supabase** (the database and team sign-in).
The code is already prepared: `api/index.js`, `vercel.json`, `server/`, `supabase/schema.sql`, `scripts/copy-to-supabase.mjs`.

## 1. Supabase (database + sign-in)
1. supabase.com → **New project**. Region: **Mumbai (ap-south-1)**. Save the database password.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Connect** (top bar) → **Transaction pooler** → copy the URI and put the database password in it. This is `SUPABASE_DB_URL`.
4. **Project Settings → API**: copy **Project URL** (`SUPABASE_URL`) and the **anon / publishable key** (`SUPABASE_ANON_KEY`).
5. **Authentication → Sign In / Providers → Google**: turn on, paste a Google OAuth **Client ID** and **Client secret**.
   In Google Cloud (APIs & Services → Credentials → that OAuth client) add the redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`.

## 2. Copy this PC's data into Supabase
Add `SUPABASE_DB_URL=...` to `.env`, then run `npm run copy-to-supabase`. Safe to run again (it never overwrites).

## 3. GitHub
```
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
Keep the repository **Private**.

## 4. Vercel
1. vercel.com → **Add New → Project** → import the GitHub repo. Framework preset: **Other** (vercel.json does the rest).
2. **Environment Variables** (Production):

| Name | Value |
|---|---|
| `SUPABASE_URL` | from step 1.4 |
| `SUPABASE_ANON_KEY` | from step 1.4 |
| `SUPABASE_DB_URL` | from step 1.3 |
| `CREDENTIAL_ENCRYPTION_KEY` | contents of `.local/encryption.key` on this PC (must be the same, or saved API keys can't be read) |
| `ADMIN_EMAIL` | `admin@creativheads.com` |
| everything else in `.env` | except `DEV_PASSWORD` (local only) |

3. **Deploy**. Note the address, e.g. `https://seo-studio.vercel.app`.

## 5. After the first deploy
1. Supabase → **Authentication → URL Configuration**: Site URL = your Vercel address; Redirect URLs: add `https://<your-app>.vercel.app/**`.
2. Google Cloud → the OAuth client used for Search Console: add redirect URI `https://<your-app>.vercel.app/oauth/google/callback`.
3. Open the Vercel address → **Continue with Google** with an email that is on the team (Admin → Manage users).
4. Settings → Knowledgebase: change the Brandroom address to Brandroom's online address (localhost does not work online).

## Notes
- Only active team members can sign in. Everyone else is refused, even with a valid Google account.
- Email sign-in links use Supabase's built-in email, which is very limited. Use Google sign-in, or add your own SMTP in Supabase → Authentication → Emails.
- Every `git push` to `main` redeploys automatically.
- Vercel Hobby is for non-commercial use; agency use needs Vercel Pro. Supabase Free pauses a project after a week without activity.
