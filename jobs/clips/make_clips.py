"""Nightly clip engine: live listings -> N unique TikTok-ready clips -> Supabase Storage -> the site's `clips` table.

Usage:
  python make_clips.py                 # production: needs SAFESWAP_READONLY_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY
  python make_clips.py --demo          # no network: placeholder listings, renders to ./out, no uploads
  python make_clips.py --demo --only texts --stills   # quick contact sheets instead of full renders

Env: CLIPS_PER_NIGHT (6), CLIPS_BUCKET (clips), CLIPS_TABLE (clips), CLIPS_FORMATS (comma list), KOKORO_DIR
"""
import argparse, datetime as dt, hashlib, io, json, os, re, sys, traceback, urllib.request
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, ".."))
from engine import listing_card, placeholder_image, render, contact_sheet, HASHTAGS, BIO
from formats import FORMATS

BUCKET = os.environ.get("CLIPS_BUCKET", "clips"); TABLE = os.environ.get("CLIPS_TABLE", "clips")
PER_NIGHT = int(os.environ.get("CLIPS_PER_NIGHT", "6"))
ORDER = [f for f in os.environ.get("CLIPS_FORMATS", "texts,spotlight,scam,notes,discover").split(",") if f in FORMATS]

def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]

# ---------- listings ----------
def fetch_image(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "SafeSwapClips/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r: return Image.open(io.BytesIO(r.read())).convert("RGB")

def load_listings(conn, limit=80):
    from common import fetch
    rows = fetch(conn, """
        select id, name, game, price::float as price, image_url, favourites_count, views
        from growth.v_listings
        where coalesce(sold, false) = false and image_url is not null and price between 0.01 and 60
          and created_at > now() - interval '90 days' and length(name) between 3 and 60
        order by coalesce(favourites_count, 0) desc, coalesce(views, 0) desc, created_at desc
        limit %s""", (limit,))
    out = []
    for r in rows:
        try: img = fetch_image(r["image_url"])
        except Exception as e: print(f"image skipped {r['id']}: {e}"); continue
        out.append(dict(id=r["id"], name=clean_name(r["name"]), game=r["game"] or "Roblox", price=r["price"], image=img))
    return out

def clean_name(n):
    n = re.sub(r"[\[\]!]+", " ", n); n = re.sub(r"\s+", " ", n).strip()
    return n.title() if n.isupper() else n

def demo_listings():
    data = [("1B Gems", "Pet Sim 99", 1.00), ("Random Huge", "Pet Sim 99", 0.05), ("Volt 4x4", "Jailbreak", 12.00), ("Skelicorn", "Adopt Me", 4.50),
            ("Chroma Set", "MM2", 3.49), ("Titanic Wheel", "Pet Sim 99", 4.00), ("20b Gems", "Pet Sim X", 9.00), ("Exclusive Snowflake Egg", "Pet Sim 99", 0.33)]
    return [dict(id=i, name=n, game=g, price=p, image=placeholder_image(n, i)) for i, (n, g, p) in enumerate(data)]

# ---------- picking ----------
def pick(fmt, listings, rng):
    need = FORMATS[fmt][1]
    if fmt == "discover":
        games = {}
        for it in listings: games.setdefault(it["game"], []).append(it)
        game = max(games, key=lambda g: len(games[g])) if rng.random() < 0.6 else str(rng.choice(list(games)))
        pool = games[game] if len(games[game]) >= 3 else listings
        idx = rng.choice(len(pool), min(need, len(pool)), replace=False); its = [pool[i] for i in idx]
        return its + [listings[i] for i in rng.choice(len(listings), max(0, need - len(its)), replace=False)]
    interesting = [it for it in listings if 0.2 <= float(it["price"]) <= 50] or listings
    pool = interesting if rng.random() < 0.75 else listings
    return [pool[int(rng.integers(0, len(pool)))]]

# ---------- supabase ----------
def sb(method, path, body=None, ctype="application/json", extra=None):
    url = os.environ["SUPABASE_URL"].rstrip("/") + path; key = os.environ["SUPABASE_SERVICE_KEY"]
    data = body if isinstance(body, (bytes, bytearray)) else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": ctype, **(extra or {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()

def ensure_bucket():
    st, _ = sb("POST", "/storage/v1/bucket", {"name": BUCKET, "public": True, "file_size_limit": 104857600})
    if st not in (200, 201, 400, 409): print(f"bucket: {st}")

def upload(path, key, ctype):
    with open(path, "rb") as f: data = f.read()
    st, body = sb("POST", f"/storage/v1/object/{BUCKET}/{key}", data, ctype, {"x-upsert": "true"})
    if st not in (200, 201): raise RuntimeError(f"upload {key}: {st} {body[:200]}")
    return os.environ["SUPABASE_URL"].rstrip("/") + f"/storage/v1/object/public/{BUCKET}/{key}"

def insert_clip(row):
    st, body = sb("POST", f"/rest/v1/{TABLE}", row, extra={"Prefer": "return=representation"})
    if st in (200, 201): return json.loads(body)[0]
    raise RuntimeError(f"insert {TABLE}: {st} {body[:300]}")

# ---------- main ----------
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--demo", action="store_true"); ap.add_argument("--only"); ap.add_argument("--stills", action="store_true"); ap.add_argument("--n", type=int)
    a = ap.parse_args()
    today = dt.date.today().isoformat(); out_dir = os.path.join(HERE, "out", today); os.makedirs(out_dir, exist_ok=True)
    n = a.n or (len(FORMATS) if a.demo else PER_NIGHT)
    fmts = [a.only] * n if a.only else [ORDER[i % len(ORDER)] for i in range(n)]

    conn = None; run = None
    if not a.demo:
        from common import db, start_run, finish_run, event
        conn = db().__enter__(); run = start_run(conn, "clips")
        ensure_bucket()
    try:
        listings = demo_listings() if a.demo else load_listings(conn)
        if len(listings) < 6: raise RuntimeError(f"only {len(listings)} usable listings")
        made = []
        for i, fmt in enumerate(fmts):
            seed = int(hashlib.sha256(f"{today}:{i}:{fmt}".encode()).hexdigest()[:8], 16); rng = np.random.default_rng(seed)
            items = pick(fmt, listings, rng); work = os.path.join(out_dir, f"{i:02d}-{fmt}"); os.makedirs(work, exist_ok=True)
            print(f"[{i+1}/{n}] {fmt} seed={seed} items={[it['name'] for it in items]}", flush=True)
            clip = FORMATS[fmt][0](items, rng, work)
            if a.stills:
                d = clip["dur"]; contact_sheet(clip["frame"], [d * x for x in (0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95)], os.path.join(out_dir, f"{i:02d}-{fmt}.png")); continue
            mp4, jpg = render(clip["frame"], clip["dur"], clip["wav"], os.path.join(work, "clip.mp4"), clip.get("thumb_at", 1.0))
            base = f"{today}/{i:02d}-{fmt}-{slug(clip['title'])}-{seed % 10000}"
            caption = clip["caption"]
            for h in HASHTAGS:
                if h not in caption: caption += " " + h
            row = dict(title=clip["title"], caption=caption, hashtags=sorted({w for w in caption.split() if w.startswith("#")}), bio_text=BIO, active=True)
            if a.demo:
                print("   ->", mp4, f"{clip['dur']:.1f}s"); made.append(row); continue
            row["video_url"] = upload(mp4, base + ".mp4", "video/mp4"); row["thumb_url"] = upload(jpg, base + ".jpg", "image/jpeg")
            try: ins = insert_clip(row); row["site_id"] = ins.get("id")
            except Exception as e: print(f"::warning title=clips table::{e}")
            with conn.cursor() as cur:
                cur.execute("insert into growth.videos (series, title, script, video_url, thumb_url, status) values (%s,%s,%s,%s,%s,'ready') returning id",
                            (fmt, clip["title"], json.dumps({"seed": seed, "items": [it["id"] for it in items], "caption": caption, "site_id": row.get("site_id")}), row["video_url"], row["thumb_url"]))
            made.append(row); print("   ->", row["video_url"], flush=True)
        if conn:
            event(conn, "CLIPS", "clips", f"{len(made)} clips rendered for creators", {"titles": [m["title"] for m in made]})
            finish_run(conn, run, "done", {"made": len(made), "formats": fmts})
        print(f"done: {len(made)} clips")
    except Exception:
        err = traceback.format_exc()
        if conn: finish_run(conn, run, "failed", error=err[-2000:])
        print(err); sys.exit(1)
    finally:
        if conn: conn.close()

if __name__ == "__main__": main()
