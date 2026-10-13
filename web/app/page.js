import { db } from "../lib/db";
import Hero from "./Hero";

export const dynamic = "force-dynamic";

const n = (v) => Number(v || 0);
const fmt = (v) => n(v).toLocaleString("en-GB");
const gbp = (v) => "£" + n(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const RANGES = { 1: "Yesterday", 7: "7 days", 28: "28 days" };
const GOAL = Number(process.env.MONTHLY_SIGNUP_GOAL || 1000);

function Delta({ now, prev }) {
  if (!prev) return <span className="delta flat">no prior data</span>;
  const p = Math.round(((now - prev) / prev) * 100);
  return <span className={`delta ${p > 0 ? "up" : p < 0 ? "down" : "flat"}`}>{p > 0 ? "+" : ""}{p}% vs previous</span>;
}

function Spark({ values, color }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values), mn = Math.min(...values);
  const pts = values.map((v, i) => `${(i * 200) / (values.length - 1)},${40 - ((v - mn) / (mx - mn || 1)) * 34}`).join(" ");
  return (
    <svg width="100%" height="40" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Bars({ rows, color, empty = "Nothing tracked yet.", fmtV = fmt }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  const mx = Math.max(...rows.map((r) => n(r.value)), 1);
  return rows.map((r, i) => (
    <div className="barrow" key={i}>
      <span className="name" title={r.source}>{r.source || "unknown"}</span>
      <div className="track"><div className="fill" style={{ width: `${Math.max(3, (n(r.value) / mx) * 100)}%`, background: color }} /></div>
      <span className="mono" style={{ width: 60, textAlign: "right", fontWeight: 700 }}>{fmtV(r.value)}</span>
    </div>
  ));
}

function Card({ title, sub, children, grow = "1 1 360px" }) {
  return (
    <section className="card" style={{ flex: grow, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2>{title}</h2>{sub && <span className="muted" style={{ fontSize: 14 }}>{sub}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const R = [1, 7, 28].includes(Number(sp?.range)) ? Number(sp.range) : 7;
  const sql = db();

  const [briefRows, core, visitsNow, visitsPrev, srcRows, countryRows, codeRows, refRows, pageRows, clickRows,
         searchRows, missRows, hourRows, runs, events] = await Promise.all([
    sql`select day, headline, text, audio is not null as has_audio from growth.briefings order by day desc limit 1`,
    sql`select day, signups, orders, gmv, new_listings, live_listings_now from growth.v_daily_core order by day`,
    sql`select count(*)::int c from growth.v_site_visits where created_at >= current_date - ${R}::int and created_at < current_date`,
    sql`select count(*)::int c from growth.v_site_visits where created_at >= current_date - ${2 * R}::int and created_at < current_date - ${R}::int`,
    sql`select case when creator_code is not null then 'Creator codes' when was_referred then 'Invites / referrals' else 'Organic' end as source, count(*)::int as value
        from growth.v_signups where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc`,
    sql`select coalesce(country, 'unknown') as source, count(*)::int as value from growth.v_signups
        where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select creator_code as source, count(*)::int as value from growth.v_signups
        where creator_code is not null and created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select coalesce(nullif(regexp_replace(lower(referrer), '^[a-z]+://(www\\.)?([^/:?]+).*$', '\\2'), ''), 'direct') as source, count(*)::int as value
        from growth.v_site_visits where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select path as source, count(*)::int as value from growth.v_site_visits
        where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select coalesce(nullif(utm_source, ''), 'untagged') as source, count(*)::int as value from growth.v_link_clicks
        where created_at >= current_date - ${R}::int and created_at < current_date group by 1 order by 2 desc limit 8`,
    sql`select term_key as source, count(*)::int as value from growth.v_search_events
        where created_at >= current_date - ${R}::int and created_at < current_date and term_key is not null group by 1 order by 2 desc limit 8`,
    sql`select term_key as source, count(*)::int as value from growth.v_search_events
        where result_count = 0 and created_at >= current_date - ${R}::int and created_at < current_date and term_key is not null group by 1 order by 2 desc limit 8`,
    sql`select extract(hour from created_at at time zone 'Europe/London')::int h, count(*)::int c from growth.v_signups
        where created_at >= current_date - 28 group by 1`,
    sql`select distinct on (job) job, status, started_at, finished_at from growth.runs order by job, started_at desc`,
    sql`select agent, message, created_at from growth.events order by created_at desc limit 8`,
  ]);

  const brief = briefRows[0];
  const today = core.length ? core[core.length - 1] : {};
  const past = core.slice(0, -1);
  const cur = past.slice(-R), prev = past.slice(-2 * R, -R);
  const sum = (rows, k) => rows.reduce((a, r) => a + n(r[k]), 0);
  const k = (key) => ({ now: sum(cur, key), prev: sum(prev, key) });
  const S = k("signups"), O = k("orders"), G = k("gmv"), L = k("new_listings");
  const V = { now: visitsNow[0].c, prev: visitsPrev[0].c };
  const last28 = past.slice(-28);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mtd = core.filter((d) => new Date(d.day) >= monthStart).reduce((a, d) => a + n(d.signups), 0);
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsed = now.getDate() - 1 + now.getHours() / 24;
  const projected = elapsed > 0 ? Math.round((mtd / elapsed) * dim) : 0;
  const goalFrac = Math.min(1, mtd / GOAL), timeFrac = elapsed / dim;
  const C1 = 2 * Math.PI * 92, C2 = 2 * Math.PI * 70;

  const hours = Array.from({ length: 24 }, (_, h) => n(hourRows.find((r) => r.h === h)?.c));
  const hmx = Math.max(...hours, 1);
  const bestHour = hours.indexOf(Math.max(...hours));
  const cmx = Math.max(...last28.map((d) => n(d.signups)), 1);

  const kpis = [
    { label: "New users", v: fmt(S.now), d: S, series: last28.map((d) => n(d.signups)), c: "#8B6CF0" },
    { label: "Site visits", v: fmt(V.now), d: V, series: [], c: "#60A5FA" },
    { label: "Visit → sign-up", v: pct(S.now, V.now) + "%", d: { now: pct(S.now, V.now), prev: pct(S.prev, V.prev) }, series: [], c: "#4ADE80" },
    { label: "Orders", v: fmt(O.now), d: O, series: last28.map((d) => n(d.orders)), c: "#4ADE80" },
    { label: "GMV", v: gbp(G.now), d: G, series: last28.map((d) => n(d.gmv)), c: "#F5B841" },
    { label: "New listings", v: fmt(L.now), d: L, series: last28.map((d) => n(d.new_listings)), c: "#60A5FA" },
  ];

  const JOBS = [
    { job: "daily_stats", name: "Analyst", task: "Pulls the numbers every morning" },
    { job: "briefing", name: "Briefing", task: "Writes and voices your briefing" },
    { job: "scout", name: "Scout", task: "Finds creators to partner with" },
    { job: "studio", name: "Studio", task: "Writes and renders videos" },
    { job: "publisher", name: "Publisher", task: "Posts to TikTok, Shorts, X" },
  ];
  const when = (t) => t ? new Date(t).toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "";
  const dayLabel = brief ? new Date(brief.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase() : "WAITING FOR FIRST RUN";

  return (
    <main className="wrap">
      <header className="top">
        <div className="brand"><div className="logo">S</div>Safe<span style={{ color: "var(--purple)" }}>Swap</span><span className="muted" style={{ fontWeight: 600 }}>/ Growth OS</span></div>
        <nav className="tabs" aria-label="Date range">
          {Object.entries(RANGES).map(([r, label]) => (
            <a key={r} href={`/?range=${r}`} className={Number(r) === R ? "tab on" : "tab"}>{label}</a>
          ))}
        </nav>
        <div className="row" style={{ gap: 10 }}>
          <span className="pill live"><span className="dot" />Machine online</span>
          <span className="pill mono" style={{ background: "#16141F", border: "1px solid var(--line)", color: "#CFCBE3" }}>{fmt(today.live_listings_now)} live listings</span>
        </div>
      </header>

      <div className="row">
        <div style={{ flex: "999 1 700px", minWidth: 0, display: "flex" }}>
          <Hero hasAudio={!!brief?.has_audio} text={brief?.text} headline={brief?.headline} dayLabel={dayLabel} />
        </div>
        <section className="card" style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="label muted">{now.toLocaleString("en-GB", { month: "long" }).toUpperCase()} GOAL</span>
            <span className="label" style={{ color: projected >= GOAL ? "#7BE6A0" : "#F5B841" }}>{projected >= GOAL ? "ON TRACK" : "BEHIND"}</span>
          </div>
          <div style={{ position: "relative", display: "grid", placeItems: "center", height: 220 }}>
            <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label={`${mtd} of ${GOAL} new users this month`}>
              <circle cx="110" cy="110" r="92" fill="none" stroke="#24212F" strokeWidth="16" />
              <circle cx="110" cy="110" r="92" fill="none" stroke="#8B6CF0" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${goalFrac * C1} ${C1}`} transform="rotate(-90 110 110)" />
              <circle cx="110" cy="110" r="70" fill="none" stroke="#1E2A22" strokeWidth="8" />
              <circle cx="110" cy="110" r="70" fill="none" stroke="#4ADE80" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${timeFrac * C2} ${C2}`} transform="rotate(-90 110 110)" />
            </svg>
            <div style={{ position: "absolute", textAlign: "center" }}>
              <div style={{ fontSize: 50, fontWeight: 900, letterSpacing: "-0.03em" }}>{fmt(mtd)}</div>
              <div className="muted">of {fmt(GOAL)} new users</div>
            </div>
          </div>
          <div className="legend"><span><i style={{ background: "#8B6CF0" }} />Goal</span><b className="mono">{Math.round(goalFrac * 100)}%</b></div>
          <div className="legend"><span><i style={{ background: "#4ADE80" }} />Month gone</span><b className="mono">{Math.round(timeFrac * 100)}%</b></div>
          <div className="note">At this pace: <b>{fmt(projected)}</b> new users by month end.</div>
        </section>
      </div>

      <section className="kpis" aria-label={`Key numbers, ${RANGES[R]}`}>
        {kpis.map((x) => (
          <div className="card kpi" key={x.label}>
            <span className="muted" style={{ fontWeight: 600 }}>{x.label} · {RANGES[R].toLowerCase()}</span>
            <div className="v">{x.v}</div>
            <Delta now={x.d.now} prev={x.d.prev} />
            <Spark values={x.series} color={x.c} />
          </div>
        ))}
      </section>

      <div className="row">
        <Card title="New users per day" sub="last 28 days" grow="999 1 620px">
          <div className="daychart" role="img" aria-label="New users per day, last 28 days">
            {last28.map((d) => (
              <div key={String(d.day)} className="daycol" title={`${new Date(d.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ${n(d.signups)}`}>
                <span className="mono">{n(d.signups)}</span>
                <div style={{ height: `${Math.max(2, (n(d.signups) / cmx) * 100)}%` }} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Funnel" sub={RANGES[R].toLowerCase()}>
          {[
            { name: "Site visits", v: V.now, w: 100, c: "#8B6CF0" },
            { name: "New users", v: S.now, w: Math.max(6, pct(S.now, V.now) * 4), c: "#6A55C9", note: `${pct(S.now, V.now)}% of visits` },
            { name: "Orders (all users)", v: O.now, w: Math.max(6, pct(O.now, V.now) * 4), c: "#4ADE80", note: "includes existing users" },
          ].map((f) => (
            <div key={f.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><b>{f.name}</b><span className="muted" style={{ fontSize: 13 }}>{f.note}</span></div>
              <div className="track" style={{ height: 38, borderRadius: 10 }}>
                <div style={{ height: 38, width: `${Math.min(100, f.w)}%`, minWidth: 80, borderRadius: 10, background: f.c, display: "flex", alignItems: "center", padding: "0 12px" }}>
                  <span className="mono" style={{ fontWeight: 700, color: f.c === "#4ADE80" ? "#0B2A16" : "#fff" }}>{fmt(f.v)}</span>
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="row">
        <Card title="New users by source" sub={RANGES[R].toLowerCase()}><Bars rows={srcRows} color="#8B6CF0" /></Card>
        <Card title="Creator codes" sub="sign-ups per code"><Bars rows={codeRows} color="#F5B841" empty="No creator-code sign-ups in this range." /></Card>
        <Card title="Countries" sub="new users"><Bars rows={countryRows} color="#60A5FA" /></Card>
      </div>

      <div className="row">
        <Card title="Where visitors came from"><Bars rows={refRows} color="#60A5FA" /></Card>
        <Card title="Top pages visited"><Bars rows={pageRows} color="#A78BFA" /></Card>
        <Card title="Tracked link clicks" sub="by utm_source"><Bars rows={clickRows} color="#4ADE80" empty="No tagged links clicked yet." /></Card>
      </div>

      <div className="row">
        <Card title="What people searched"><Bars rows={searchRows} color="#F5B841" /></Card>
        <Card title="Searched but not found" sub="demand with no listings: content ideas"><Bars rows={missRows} color="#F87171" empty="Every search found something." /></Card>
        <Card title="Best hours for sign-ups" sub={`last 28 days · peak ${String(bestHour).padStart(2, "0")}:00`}>
          <div className="hours" role="img" aria-label={`Sign-ups by hour, peak at ${bestHour}:00`}>
            {hours.map((c, h) => (
              <div key={h} title={`${String(h).padStart(2, "0")}:00 · ${c}`} style={{ background: `rgba(139,108,240,${0.08 + 0.92 * (c / hmx)})` }}>
                {h % 3 === 0 && <span>{String(h).padStart(2, "0")}</span>}
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 14 }}>Post 1–2 hours before the peak.</div>
        </Card>
      </div>

      <div className="row">
        <Card title="Your team" sub="machine jobs" grow="999 1 620px">
          <div className="agents">
            {JOBS.map((j) => {
              const r = runs.find((x) => x.job === j.job);
              const st = !r ? "NOT BUILT" : r.status === "done" ? "DONE" : r.status === "failed" ? "FAILED" : "RUNNING";
              const col = st === "DONE" ? "#7BE6A0" : st === "FAILED" ? "#F87171" : st === "RUNNING" ? "#B9A5FF" : "#6F6A88";
              return (
                <div key={j.job} className="agent" style={{ opacity: r ? 1 : 0.55 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><b>{j.name}</b><span className="label" style={{ color: col }}>{st}</span></div>
                  <span className="muted" style={{ fontSize: 14 }}>{j.task}</span>
                  <span className="mono" style={{ fontSize: 12, color: "#8E8AA6" }}>{r ? when(r.finished_at || r.started_at) : "coming next"}</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Activity">
          <div className="feed">
            {events.length ? events.map((e, i) => <div key={i}>{e.message}<small>{e.agent} · {when(e.created_at)}</small></div>)
                           : <div className="empty">No activity yet.</div>}
          </div>
        </Card>
      </div>
    </main>
  );
}
