import { db } from "./db";

const GROWTH = 1.25; // each month's goal = last month's new users + 25%
export const RANGES = { 1: "yesterday", 7: "last 7 days", 28: "last 28 days" };

const n = (v) => Number(v || 0);
const sum = (rows, k) => rows.reduce((a, r) => a + n(r[k]), 0);

function londonNow() {
  const s = new Date().toLocaleString("en-US", { timeZone: "Europe/London" });
  return new Date(s);
}

function finish(raw, R) {
  const now = londonNow();
  const todayKey = now.toISOString().slice(0, 10);
  const core = raw.core.map((d) => ({ ...d, day: String(d.day).slice(0, 10), signups: n(d.signups), orders: n(d.orders), gmv: n(d.gmv), new_listings: n(d.new_listings) }));
  const today = core.find((d) => d.day === todayKey) || null;
  const past = core.filter((d) => d.day < todayKey);
  const cur = past.slice(-R), prev = past.slice(-2 * R, -R);
  const k = (key) => ({ now: sum(cur, key), prev: sum(prev, key) });

  const mStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lmStart = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, "0")}-01`;
  const mtd = core.filter((d) => d.day >= mStart).reduce((a, d) => a + d.signups, 0);
  const lastMonth = core.filter((d) => d.day >= lmStart && d.day < mStart).reduce((a, d) => a + d.signups, 0);
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsed = now.getDate() - 1 + now.getHours() / 24;
  const goal = Number(process.env.MONTHLY_SIGNUP_GOAL) || Math.ceil((lastMonth * GROWTH) / 100) * 100 || 1000;
  const projected = elapsed > 0.5 ? Math.round((mtd / elapsed) * dim) : 0;

  const last28 = past.slice(-28);
  const avg7 = last28.map((_, i) => {
    const w = past.slice(Math.max(0, past.length - 28 + i - 6), past.length - 28 + i + 1);
    return w.length ? w.reduce((a, d) => a + d.signups, 0) / w.length : 0;
  });

  return {
    range: R, rangeLabel: RANGES[R], now,
    brief: raw.brief ? { ...raw.brief, plan: Array.isArray(raw.brief.plan) ? raw.brief.plan : [] } : null,
    liveListings: n((core[core.length - 1] || {}).live_listings_now),
    today, past, last28, avg7,
    kpis: { signups: k("signups"), orders: k("orders"), gmv: k("gmv"), listings: k("new_listings"), visits: { now: n(raw.visitsNow), prev: n(raw.visitsPrev) } },
    goal: { mtd, goal, lastMonth, projected, dim, elapsed, monthName: now.toLocaleString("en-GB", { month: "long" }) },
    sources: raw.sources, codes: raw.codes, countries: raw.countries, referrers: raw.referrers, pages: raw.pages,
    clicks: raw.clicks, searches: raw.searches, misses: raw.misses,
    hours: Array.from({ length: 24 }, (_, h) => n((raw.hours.find((r) => Number(r.h) === h) || {}).c)),
    runs: raw.runs, events: raw.events,
    updatedAt: raw.updatedAt,
  };
}

export async function getDashboard(rangeParam) {
  const R = [1, 7, 28].includes(Number(rangeParam)) ? Number(rangeParam) : 7;
  if (process.env.PREVIEW_FIXTURE) return finish(fixture(), R);
  const sql = db();
  const [briefRows, core, vNow, vPrev, sources, countries, codes, referrers, pages, clicks, searches, misses, hours, runs, events, upd] = await Promise.all([
    sql`select day, headline, plan, created_at, audio is not null as has_audio from growth.briefings order by day desc limit 1`,
    sql`select day, signups, orders, gmv, new_listings, live_listings_now from growth.v_daily_core order by day`,
    sql`select count(*)::int c from growth.v_site_visits where created_at >= current_date - ${R}::int and created_at < current_date`,
    sql`select count(*)::int c from growth.v_site_visits where created_at >= current_date - ${2 * R}::int and created_at < current_date - ${R}::int`,
    sql`select case when creator_code is not null then 'Creator codes' when was_referred then 'Invites' else 'Organic' end as source, count(*)::int as value
        from growth.v_signups where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc`,
    sql`select coalesce(country, 'Unknown') as source, count(*)::int as value from growth.v_signups
        where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select creator_code as source, count(*)::int as value from growth.v_signups
        where creator_code is not null and created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select coalesce(nullif(regexp_replace(lower(referrer), '^[a-z]+://(www\\.)?([^/:?]+).*$', '\\2'), ''), 'Direct') as source, count(*)::int as value
        from growth.v_site_visits where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select path as source, count(*)::int as value from growth.v_site_visits
        where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select coalesce(nullif(utm_source, ''), 'Untagged') as source, count(*)::int as value from growth.v_link_clicks
        where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select term_key as source, count(*)::int as value from growth.v_search_events
        where created_at >= current_date - ${R}::int and created_at < current_date and term_key is not null group by 1 order by 2 desc limit 8`,
    sql`select term_key as source, count(*)::int as value from growth.v_search_events
        where result_count = 0 and created_at >= current_date - ${R}::int and created_at < current_date and term_key is not null group by 1 order by 2 desc limit 8`,
    sql`select extract(hour from created_at at time zone 'Europe/London')::int h, count(*)::int c from growth.v_signups
        where created_at >= current_date - 28 group by 1`,
    sql`select distinct on (job) job, status, started_at, finished_at, error from growth.runs order by job, started_at desc`,
    sql`select agent, message, created_at from growth.events order by created_at desc limit 12`,
    sql`select max(finished_at) t from growth.runs where status = 'done'`,
  ]);
  return finish({
    brief: briefRows[0] || null, core, visitsNow: vNow[0].c, visitsPrev: vPrev[0].c,
    sources, countries, codes, referrers, pages, clicks, searches, misses, hours, runs, events, updatedAt: upd[0]?.t || null,
  }, R);
}

// ---------- preview data (PREVIEW_FIXTURE=1), never shown in production ----------
function fixture() {
  const seed = (i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  const core = [];
  const today = londonNow();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const base = 40 + (89 - i) * 1.1;
    let signups = Math.round(base + seed(i) * 40);
    if (i === 2) signups = 275; if (i === 1) signups = 158; if (i === 0) signups = 29;
    core.push({ day, signups, orders: Math.round(90 + seed(i + 7) * 90), gmv: 60 + seed(i + 3) * 90, new_listings: Math.round(90 + seed(i + 11) * 120), live_listings_now: 2054 });
  }
  const t = (h, m) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d; };
  return {
    brief: { day: today.toISOString().slice(0, 10), headline: "Signups cooled, but the base is higher", has_audio: true, created_at: t(7, 2),
      plan: ["Tag every TikTok link with utm_source so the spike can be traced", "Add listings for Robux and 'robu' searches, 58 people looked and found nothing", "Post on @safeswap.ps99 at 15:00, an hour before the sign-up peak", "Reply to the two creator leads that came in overnight"] },
    core, visitsNow: 12840, visitsPrev: 9100,
    sources: [{ source: "Organic", value: 1083 }, { source: "Invites", value: 31 }, { source: "Creator codes", value: 6 }],
    countries: [{ source: "GB", value: 812 }, { source: "US", value: 203 }, { source: "AU", value: 44 }, { source: "CA", value: 31 }, { source: "IE", value: 18 }],
    codes: [{ source: "PETKING", value: 4 }, { source: "GEMLORD", value: 2 }],
    referrers: [{ source: "Direct", value: 12120 }, { source: "tiktok.com", value: 412 }, { source: "google.com", value: 188 }, { source: "youtube.com", value: 71 }, { source: "discord.com", value: 49 }],
    pages: [{ source: "/", value: 7310 }, { source: "/browse", value: 2910 }, { source: "/item", value: 1402 }, { source: "/robux", value: 611 }, { source: "/signup", value: 433 }],
    clicks: [{ source: "Untagged", value: 7 }],
    searches: [{ source: "robux", value: 58 }, { source: "huge", value: 41 }, { source: "gems", value: 33 }, { source: "titanic", value: 21 }, { source: "mm2", value: 17 }],
    misses: [{ source: "robux", value: 58 }, { source: "robu", value: 12 }, { source: "garden", value: 9 }, { source: "blox fruits", value: 7 }],
    hours: Array.from({ length: 24 }, (_, h) => ({ h, c: Math.round(10 + 60 * Math.exp(-((h - 16.5) ** 2) / 14) + seed(h) * 8) })),
    runs: [{ job: "daily_stats", status: "done", started_at: t(7, 0), finished_at: t(7, 1) }, { job: "briefing", status: "done", started_at: t(7, 1), finished_at: t(7, 2) }],
    events: [{ agent: "BRIEFING", message: "Morning briefing ready: Signups cooled, but the base is higher", created_at: t(7, 2) },
             { agent: "ANALYST", message: "Pulled yesterday's numbers: 158 sign-ups, 12,840 visits", created_at: t(7, 1) }],
    updatedAt: t(7, 2),
  };
}
