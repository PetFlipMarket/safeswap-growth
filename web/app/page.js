import { getDashboard } from "../lib/data";
import Shell from "../components/Shell";
import Briefing from "../components/Briefing";
import Ask from "../components/Ask";
import Header, { when, whenFull } from "../components/Header";
import { Area, Bars, Delta, Ring, Stat, fmt, gbp, pct } from "../components/Viz";

export const dynamic = "force-dynamic";

export default async function Today({ searchParams }) {
  const sp = await searchParams;
  const d = await getDashboard(sp?.range);
  const h = d.now.getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = d.now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const k = d.kpis, g = d.goal;
  const jobs = [["daily_stats", "Analyst"], ["briefing", "Briefing"], ["scout", "Scout"], ["studio", "Studio"], ["publisher", "Publisher"]];
  const online = d.runs.some((r) => r.status === "done");

  return (
    <Shell online={online}>
      <div className="page">
        <Header title={`${greet}, Ethan`} sub={d.updatedAt ? `${dateLabel}, numbers updated at ${when(d.updatedAt)}` : dateLabel} range={d.range} />

        <Briefing hasAudio={!!d.brief?.has_audio} headline={d.brief?.headline} plan={d.brief?.plan}
          dateLabel={d.brief ? (String(d.brief.day).slice(0, 10) === d.now.toISOString().slice(0, 10) ? "Written today" : `Written ${new Date(d.brief.day).toLocaleDateString("en-GB", { weekday: "long" })}`) : ""}
          madeAt={when(d.brief?.created_at)} />

        <div className="grid">
          <section className="panel c4 hero-stat" aria-label="New users">
            <span className="label">New users, {d.rangeLabel}</span>
            <span className="big num">{fmt(k.signups.now)}</span>
            <div><Delta now={k.signups.now} prev={k.signups.prev} suffix=" on the period before" /></div>
            {d.today && <span className="label">Today so far: <b className="num" style={{ color: "var(--mist)" }}>{fmt(d.today.signups)}</b></span>}
            <div className="goal" style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 18 }}>
              <Ring frac={g.mtd / g.goal} color="#D9B04C">{Math.round((g.mtd / g.goal) * 100)}%</Ring>
              <div className="txt">
                <b className="num">{fmt(g.mtd)} of {fmt(g.goal)}</b>
                <span>{g.monthName} goal (last month +25%)</span>
                <span>On pace for <b className="num" style={{ fontSize: 14 }}>{fmt(g.projected)}</b></span>
              </div>
            </div>
          </section>

          <section className="block c8" aria-label="New users per day">
            <div className="bhead">
              <div><h2>New users per day</h2><div className="sub">Last 28 days, with the 7-day average</div></div>
              <div className="legend"><span><i style={{ background: "#8B6CF0" }} />Daily</span><span><i style={{ background: "#D9B04C" }} />7-day average</span></div>
            </div>
            <Area days={d.last28} avg={d.avg7} label="New users per day" />
          </section>
        </div>

        <div className="stats" aria-label="Supporting numbers">
          <Stat label="Site visits" value={fmt(k.visits.now)} now={k.visits.now} prev={k.visits.prev} />
          <Stat label="Visits that became users" value={pct(k.signups.now, k.visits.now) + "%"} now={pct(k.signups.now, k.visits.now)} prev={pct(k.signups.prev, k.visits.prev)} />
          <Stat label="Orders" value={fmt(k.orders.now)} now={k.orders.now} prev={k.orders.prev} series={d.last28.map((x) => x.orders)} color="#4CD98A" />
          <Stat label="Sales value" value={gbp(k.gmv.now)} now={k.gmv.now} prev={k.gmv.prev} series={d.last28.map((x) => x.gmv)} color="#D9B04C" />
        </div>

        <div className="grid top">
          <section className="block c6">
            <div className="bhead"><div><h2>Where new users came from</h2><div className="sub">{d.rangeLabel}</div></div></div>
            <Bars rows={d.sources} />
          </section>
          <section className="block c6">
            <div className="bhead"><div><h2>Searched for, but not on SafeSwap</h2><div className="sub">Demand with nothing to buy. Content and listing ideas.</div></div></div>
            <Bars rows={d.misses} tone="red" showShare={false} empty="Every search found something." fmtV={(v) => `${fmt(v)} searches`} />
          </section>
        </div>

        <section className="block c12" aria-label="The machine">
          <div className="bhead">
            <div><h2>The machine</h2><div className="sub">What ran, and what's coming next</div></div>
            <a href="/machine">See all activity</a>
          </div>
          <div className="agents">
            {jobs.map(([job, name]) => {
              const r = d.runs.find((x) => x.job === job);
              const st = !r ? "off" : r.status === "done" ? "done" : r.status === "failed" ? "fail" : "run";
              const txt = { off: "Not built yet", done: "Done", fail: "Failed", run: "Running" }[st];
              return (
                <div key={job} className={`agent ${st === "off" ? "off" : ""}`}>
                  <div className="top"><b>{name}</b><span className={`state ${st}`}><i />{txt}</span></div>
                  <span className="when">{r ? whenFull(r.finished_at || r.started_at) : "coming next"}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <Ask />
    </Shell>
  );
}
