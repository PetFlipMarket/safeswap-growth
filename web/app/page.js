import { db } from "../lib/db";
import Player from "./Player";

export const dynamic = "force-dynamic";

const n = (v) => Number(v || 0);
const fmt = (v) => n(v).toLocaleString("en-GB");
const gbp = (v) => "£" + n(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Delta({ now, prev }) {
  if (!prev) return <span className="delta flat">new</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  const cls = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return <span className={`delta ${cls}`}>{pct > 0 ? "+" : ""}{pct}% vs day before</span>;
}

function Spark({ values, color }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values), mn = Math.min(...values);
  const pts = values.map((v, i) => `${(i * 200) / (values.length - 1)},${40 - ((v - mn) / (mx - mn || 1)) * 34}`).join(" ");
  return (
    <svg width="100%" height="44" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Bars({ rows, color }) {
  if (!rows.length) return <div className="empty">Nothing tracked yet.</div>;
  const mx = Math.max(...rows.map((r) => n(r.value)));
  return rows.map((r) => (
    <div className="barrow" key={r.source}>
      <span className="name">{r.source}</span>
      <div className="track"><div className="fill" style={{ width: `${Math.max(3, (n(r.value) / mx) * 100)}%`, background: color }} /></div>
      <span className="mono" style={{ width: 52, textAlign: "right", fontWeight: 700 }}>{fmt(r.value)}</span>
    </div>
  ));
}

export default async function Page() {
  const sql = db();
  const [brief] = await sql`select day, headline, text, plan, audio is not null as has_audio from growth.briefings order by day desc limit 1`;
  const core = await sql`select day, signups, orders, gmv, new_listings, live_listings_now from growth.v_daily_core where day < current_date order by day desc limit 14`;
  const days = [...core].reverse();
  const y = core[0] || {}, p = core[1] || {};
  const yday = y.day;
  const by = (m) => yday ? sql`select source, value from growth.daily_stats where day = ${yday} and metric = ${m} order by value desc limit 8` : [];
  const [srcSignups, srcClicks, srcVisits] = await Promise.all([by("signups_by_source"), by("clicks_by_source"), by("visits_by_referrer")]);
  const searches = yday ? await sql`select term_key as source, count(*) as value from growth.v_search_events where created_at::date = ${yday} group by 1 order by 2 desc limit 8` : [];
  const events = await sql`select agent, message, created_at from growth.events order by created_at desc limit 8`;

  const kpis = [
    { label: "New users", v: fmt(y.signups), now: n(y.signups), prev: n(p.signups), series: days.map((d) => n(d.signups)), c: "#8B6CF0" },
    { label: "Orders", v: fmt(y.orders), now: n(y.orders), prev: n(p.orders), series: days.map((d) => n(d.orders)), c: "#4ADE80" },
    { label: "GMV", v: gbp(y.gmv), now: n(y.gmv), prev: n(p.gmv), series: days.map((d) => n(d.gmv)), c: "#F5B841" },
    { label: "New listings", v: fmt(y.new_listings), now: n(y.new_listings), prev: n(p.new_listings), series: days.map((d) => n(d.new_listings)), c: "#60A5FA" },
  ];
  const plan = Array.isArray(brief?.plan) ? brief.plan : [];
  const when = (t) => new Date(t).toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

  return (
    <main className="wrap">
      <header className="top">
        <div className="brand"><div className="logo">S</div>Safe<span style={{ color: "var(--purple)" }}>Swap</span><span className="muted" style={{ fontWeight: 600 }}>/ Growth OS</span></div>
        <div className="row" style={{ gap: 10 }}>
          <span className="pill live"><span className="dot" />Machine online</span>
          <span className="pill mono" style={{ background: "#16141F", border: "1px solid var(--line)", color: "#CFCBE3" }}>
            {fmt(y.live_listings_now)} live listings
          </span>
        </div>
      </header>

      <section className="card hero" aria-label="Morning briefing">
        <Player hasAudio={!!brief?.has_audio} />
        <div style={{ flex: "1 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="label" style={{ color: "var(--purple2)" }}>DAILY BRIEFING · {brief ? new Date(brief.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "WAITING FOR FIRST RUN"}</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.05 }}>{brief?.headline || "Morning, Ethan."}</h1>
          {brief ? <p className="transcript" style={{ margin: 0 }}>{brief.text}</p>
                 : <p className="empty">The first briefing appears after the 7am job runs.</p>}
        </div>
      </section>

      {plan.length > 0 && (
        <section className="card" aria-label="Today's plan">
          <h2 style={{ marginBottom: 14 }}>Today's plan</h2>
          <ol className="plan">{plan.map((t, i) => <li key={i}><b>{String(i + 1).padStart(2, "0")}</b><span>{t}</span></li>)}</ol>
        </section>
      )}

      <section className="row" aria-label="Yesterday">
        {kpis.map((k) => (
          <div className="card kpi" key={k.label}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="muted" style={{ fontWeight: 600 }}>{k.label} yesterday</span>
            </div>
            <div className="v">{k.v}</div>
            <Delta now={k.now} prev={k.prev} />
            <Spark values={k.series} color={k.c} />
          </div>
        ))}
      </section>

      <div className="row">
        <section className="card" style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2>New users by source</h2><Bars rows={srcSignups} color="#8B6CF0" />
        </section>
        <section className="card" style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2>Where visitors came from</h2><Bars rows={srcVisits} color="#60A5FA" />
        </section>
      </div>
      <div className="row">
        <section className="card" style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2>Tracked link clicks</h2><Bars rows={srcClicks} color="#4ADE80" />
        </section>
        <section className="card" style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2>What people searched</h2><Bars rows={searches} color="#F5B841" />
        </section>
      </div>

      <section className="card" aria-label="Activity">
        <h2 style={{ marginBottom: 12 }}>Machine activity</h2>
        <div className="feed">
          {events.length ? events.map((e, i) => <div key={i}>{e.message}<small>{e.agent} · {when(e.created_at)}</small></div>)
                         : <div className="empty">No activity yet.</div>}
        </div>
      </section>
    </main>
  );
}
