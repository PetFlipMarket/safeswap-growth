"""Writes and voices the morning briefing, then stores it in growth.briefings."""
import datetime as dt
import json
import os
import re
import subprocess
import traceback
import wave

import anthropic
import numpy as np

from common import db, event, fetch, finish_run, start_run

MODEL = os.environ.get("BRIEFING_MODEL", "claude-sonnet-5-5")
VOICE = os.environ.get("BRIEFING_VOICE", "am_adam")
LANG = os.environ.get("BRIEFING_LANG", "en-us")
KOKORO_DIR = os.environ.get("KOKORO_DIR", "kokoro")

SYSTEM = """You are the voice of SafeSwap Growth OS, a marketing machine whose ONLY goal is getting new users
for SafeSwap (a UK marketplace for Roblox items). You brief the founder, Ethan, every morning out loud.

Write like a sharp, friendly chief of staff talking, not reading a report:
- British English, casual, direct, no waffle, no filler, no emoji.
- Round numbers for speech ("about a hundred and sixty"), compare to the previous days, call out what changed and why it matters.
- Only use numbers present in the data. Never invent stats. If a data source is empty, say briefly that it isn't tracked yet.
- Spoken length: about 150-220 words (60-90 seconds).
- End with today's plan: 3-5 concrete acquisition actions, most important first.

Return ONLY JSON: {"headline": "<max 8 words>", "speech": "<the full spoken script, plan included>", "plan": ["<action>", ...]}"""


def gather(conn):
    y = dt.date.today() - dt.timedelta(days=1)
    core = fetch(conn, "select day, signups, orders, round(gmv::numeric,2) gmv, new_listings from growth.v_daily_core where day >= %s and day < current_date order by day", (y - dt.timedelta(days=13),))
    by = lambda m: fetch(conn, "select source, value from growth.daily_stats where day=%s and metric=%s order by value desc", (y, m))
    live = fetch(conn, "select value from growth.daily_stats where metric='live_listings' order by day desc limit 1")
    searches = fetch(conn, """select term_key, count(*) n, round(avg(result_count)) avg_results from growth.v_search_events
                              where created_at::date = %s group by 1 order by 2 desc limit 10""", (y,))
    sellers = fetch(conn, "select username, sales from growth.v_top_sellers_week limit 3")
    leads = fetch(conn, "select status, count(*) n from growth.leads group by 1")
    return {
        "today": str(dt.date.today()), "yesterday": str(y),
        "last_14_days": core,
        "signups_by_source_yesterday": by("signups_by_source"),
        "link_clicks_by_utm_yesterday": by("clicks_by_source"),
        "site_visits_by_referrer_yesterday": by("visits_by_referrer"),
        "live_listings": live[0]["value"] if live else None,
        "top_searches_yesterday": searches,
        "top_sellers_this_week": sellers,
        "creator_leads_by_status": leads,
        "not_built_yet": ["TikTok/YouTube/X post stats", "video queue", "ad spend"],
    }


def write(facts):
    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=MODEL, max_tokens=1500, system=SYSTEM,
        messages=[{"role": "user", "content": "Data for this morning's briefing:\n" + json.dumps(facts, default=str)}],
    )
    text = "".join(b.text for b in msg.content if b.type == "text")
    m = re.search(r"\{.*\}", text, re.S)
    return json.loads(m.group(0))


def speak(text):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if key:
        import urllib.request
        vid = os.environ.get("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")  # Adam
        body = json.dumps({"text": text, "model_id": "eleven_turbo_v2_5", "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}}).encode()
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_64", data=body,
                                     headers={"xi-api-key": key, "content-type": "application/json", "accept": "audio/mpeg"})
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    from kokoro_onnx import Kokoro
    k = Kokoro(f"{KOKORO_DIR}/kokoro-v1.0.onnx", f"{KOKORO_DIR}/voices-v1.0.bin")
    parts, sr = [], 24000
    for s in [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]:
        a, sr = k.create(s, voice=VOICE, speed=1.08, lang=LANG)
        parts += [a, np.zeros(int(sr * 0.18), dtype=np.float32)]
    audio = np.concatenate(parts)
    with wave.open("briefing.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "briefing.wav", "-c:a", "libmp3lame", "-b:a", "64k", "briefing.mp3"], check=True)
    with open("briefing.mp3", "rb") as f:
        return f.read()


def main():
    with db() as conn:
        run = start_run(conn, "briefing")
        try:
            facts = gather(conn)
            out = write(facts)
            mp3 = speak(out["speech"])
            with conn.cursor() as cur:
                cur.execute(
                    """insert into growth.briefings (day, text, headline, plan, audio) values (%s,%s,%s,%s,%s)
                       on conflict (day) do update set text=excluded.text, headline=excluded.headline,
                       plan=excluded.plan, audio=excluded.audio, created_at=now()""",
                    (dt.date.today(), out["speech"], out.get("headline"), json.dumps(out.get("plan", [])), mp3),
                )
            event(conn, "BRIEFING", "briefing", f"Morning briefing ready: {out.get('headline')}")
            finish_run(conn, run, "done", {"headline": out.get("headline"), "bytes": len(mp3)})
            print(out["headline"]); print(out["speech"])
        except Exception:
            finish_run(conn, run, "failed", error=traceback.format_exc()[-2000:])
            raise


if __name__ == "__main__":
    main()
