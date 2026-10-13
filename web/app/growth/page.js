import { getDashboard } from "../../lib/data";
import Shell from "../../components/Shell";
import Ask from "../../components/Ask";
import Header, { when } from "../../components/Header";
import { Area, Bars, Hours, Stat, fmt, gbp, pct } from "../../components/Viz";

export const dynamic = "force-dynamic";

export default async function Growth({ searchParams }) {
  const sp = await searchParams;
  const d = await getDashboard(sp?.range);
  const k = d.kpis;
  const peak = d.hours.indexOf(Math.max(...d.hours));
  const online = d.runs.some((r) => r.status === "done");
  return (
    <Shell online={online}>
      <div className="page">
        <Header title="Growth" sub={`Where new users come from and what they want, ${d.rangeLabel}${d.updatedAt ? `. Updated ${when(d.updatedAt)}` : ""}`} range={d.range} base="/growth" />

        <div className="stats">
          <Stat label="New users" value={fmt(k.signups.now)} now={k.signups.now} prev={k.signups.prev} series={d.last28.map((x) => x.signups)} />
          <Stat label="Site visits" value={fmt(k.visits.now)} now={k.visits.now} prev={k.visits.prev} />
          <Stat label="Visits that became users" value={pct(k.signups.now, k.visits.now) + "%"} now={pct(k.signups.now, k.visits.now)} prev={pct(k.signups.prev, k.visits.prev)} />
          <Stat label="New listings" value={fmt(k.listings.now)} now={k.listings.now} prev={k.listings.prev} series={d.last28.map((x) => x.new_listings)} color="#5BA8FF" />
        </div>

        <div className="grid">
          <section className="block c8">
            <div className="bhead"><div><h2>New users per day</h2><div className="sub">Last 28 days, with the 7-day average</div></div></div>
            <Area days={d.last28} avg={d.avg7} label="New users per day" />
          </section>
          <section className="block c4">
            <div className="bhead"><div><h2>Best hours for sign-ups</h2><div className="sub">Last 28 days. Busiest at {peak}:00, so post an hour or two before.</div></div></div>
            <Hours hours={d.hours} />
          </section>
        </div>

        <div className="grid top">
          <section className="block c4"><div className="bhead"><h2>How new users arrived</h2></div><Bars rows={d.sources} /></section>
          <section className="block c4"><div className="bhead"><h2>Creator codes used</h2></div><Bars rows={d.codes} tone="gold" empty="No creator-code sign-ups in this period." /></section>
          <section className="block c4"><div className="bhead"><h2>Countries</h2></div><Bars rows={d.countries} tone="blue" /></section>
        </div>

        <div className="grid top">
          <section className="block c4"><div className="bhead"><h2>Sites that sent visitors</h2></div><Bars rows={d.referrers} tone="blue" /></section>
          <section className="block c4"><div className="bhead"><h2>Pages people landed on</h2></div><Bars rows={d.pages} tone="blue" /></section>
          <section className="block c4"><div className="bhead"><h2>Tagged link clicks</h2></div><Bars rows={d.clicks} empty="No tagged links clicked yet. Add utm_source to the links you share." /></section>
        </div>

        <div className="grid top">
          <section className="block c6"><div className="bhead"><div><h2>What people searched for</h2><div className="sub">Most-searched terms</div></div></div><Bars rows={d.searches} showShare={false} /></section>
          <section className="block c6"><div className="bhead"><div><h2>Searched for, but not on SafeSwap</h2><div className="sub">Demand with nothing to buy</div></div></div><Bars rows={d.misses} tone="red" showShare={false} empty="Every search found something." /></section>
        </div>

        <div className="stats">
          <Stat label="Orders (all users)" value={fmt(k.orders.now)} now={k.orders.now} prev={k.orders.prev} series={d.last28.map((x) => x.orders)} color="#4CD98A" />
          <Stat label="Sales value" value={gbp(k.gmv.now)} now={k.gmv.now} prev={k.gmv.prev} series={d.last28.map((x) => x.gmv)} color="#D9B04C" />
          <Stat label="Live listings now" value={fmt(d.liveListings)} />
          <Stat label="Today so far" value={fmt(d.today?.signups)} />
        </div>
      </div>
      <Ask />
    </Shell>
  );
}
