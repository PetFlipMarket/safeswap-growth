# Clip engine

Renders unique, TikTok-ready SafeSwap clips every night from live listings and drops them into the site's
`clips` table (the creator programme's "today's clips"). Nothing here touches the marketplace.

**Formats** (`formats.py`): `texts` (iMessage thread), `notes` (phone note), `scam` (four scam lines), `discover`
(grid of real listings), `spotlight` (would you buy it). Each clip gets a seed from the date + index, so hooks, names,
voices and items differ every time — no two creators ever post the same file.

**Pipeline** (`make_clips.py`): `growth.v_listings` → pick items → render (Kokoro Adam voice, ffmpeg) → upload MP4 +
thumbnail to Supabase Storage bucket `clips` (public) → insert into `public.clips`
(`title, video_url, thumb_url, caption, hashtags[], bio_text, active`) → log in `growth.videos` and `growth.events`.

**Secrets** (GitHub → Settings → Secrets): `SAFESWAP_READONLY_DB_URL` (exists), `SUPABASE_URL`
(`https://<project>.supabase.co`), `SUPABASE_SERVICE_KEY` (service role key — storage + insert; never the anon key).

**Runs**: `.github/workflows/clips.yml`, 03:30 UK nightly, or Actions → Nightly clips → Run workflow (choose a count).
`CLIPS_PER_NIGHT` (6), `CLIPS_FORMATS` (order/subset), `CLIPS_TABLE`, `CLIPS_BUCKET` tune it.

**Local**: `cd jobs/clips && python make_clips.py --demo --stills` (contact sheets, no network) or `--demo --only texts --n 1`
(full render to `out/`). Needs `jobs/kokoro/` model files and the Noto Color Emoji font.
