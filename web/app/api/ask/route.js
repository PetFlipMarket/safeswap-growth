import { db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ASK_MODEL || "claude-sonnet-5-5";

const SCHEMA = `Read-only views and tables in schema "growth" (Postgres; timestamps are UTC, the user is in Europe/London):
- v_daily_core(day, signups, orders, gmv, new_listings, live_listings_now)  -- one row per day, last 90 days
- v_signups(created_at, country, was_referred, creator_code, creator_id)     -- one row per new user
- v_site_visits(created_at, path, country, referrer)
- v_link_clicks(created_at, slug, content_code, utm_source, utm_medium, utm_campaign)
- v_listings(id, created_at, name, game, game_key, price, rarity, image_url, seller, sold, sold_at, stock, views, favourites_count, market, delivery_methods)
- v_top_sellers_week(username, sales, earned), v_top_buyers_week(username, orders, spent)
- v_seller_reviews(seller, reviews, avg_rating)
- v_search_events(created_at, term, term_key, game, result_count)
- v_known_creators(src, platform, handle, profile_url, status, created_at)
- v_creator_videos(id, creator_id, platform, url, title, status, views, likes, submitted_at, views_24h, views_7d)
- daily_stats(day, metric, source, value)  -- metrics: signups, orders, gmv, new_listings, live_listings, signups_by_source, clicks_by_source, visits_by_referrer, visits
- briefings(day, headline, text, plan), events(agent, kind, message, created_at), runs(job, status, started_at, finished_at, error), leads(...)`;

const SYSTEM = `You are SafeSwap Growth OS, answering Ethan (the founder) out loud on his phone.
SafeSwap is a UK marketplace for Roblox items. The machine's only goal is getting NEW users.
Use the run_sql tool to look up real numbers before answering anything numeric. Never guess or invent numbers.
Your answer is SPOKEN: 1-4 short sentences, British English, plain words, round numbers sensibly, no lists, no markdown, no emoji.
If something isn't tracked yet, say so in one sentence.
${SCHEMA}`;

const TOOLS = [{
  name: "run_sql",
  description: "Run ONE read-only SELECT against the growth schema. Returns up to 50 rows as JSON.",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
}];

async function runSql(query) {
  const q = String(query || "").trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(q) || q.includes(";")) return { error: "Only a single SELECT is allowed." };
  try {
    const rows = await db().begin("read only", (t) => t.unsafe(`select * from (${q}) _q limit 50`));
    return { rows: JSON.parse(JSON.stringify(rows, (k, v) => (typeof v === "bigint" ? Number(v) : v))) };
  } catch (e) {
    return { error: String(e.message || e).slice(0, 400) };
  }
}

async function claude(messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 800, system: SYSTEM, tools: TOOLS, messages }),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

export async function POST(req) {
  const { question, history = [] } = await req.json();
  if (!question) return Response.json({ answer: "I didn't catch that." });
  const today = new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const messages = [
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: `(Today is ${today}.) ${question}` },
  ];
  try {
    for (let i = 0; i < 6; i++) {
      const res = await claude(messages);
      messages.push({ role: "assistant", content: res.content });
      const calls = res.content.filter((b) => b.type === "tool_use");
      if (!calls.length) {
        const answer = res.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
        return Response.json({ answer: answer || "I couldn't work that out." });
      }
      const results = [];
      for (const c of calls) {
        results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(await runSql(c.input?.query)) });
      }
      messages.push({ role: "user", content: results });
    }
    return Response.json({ answer: "That one took too many steps. Try asking it a simpler way." });
  } catch (e) {
    return Response.json({ answer: "Something went wrong reaching the data.", error: String(e.message || e) }, { status: 500 });
  }
}
