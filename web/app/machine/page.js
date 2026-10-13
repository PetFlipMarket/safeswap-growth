import { getDashboard } from "../../lib/data";
import Shell from "../../components/Shell";
import Ask from "../../components/Ask";
import Header, { whenFull } from "../../components/Header";

export const dynamic = "force-dynamic";

const AGENTS = [
  ["daily_stats", "Analyst", "Pulls yesterday's numbers from SafeSwap, read-only, every morning at 7."],
  ["briefing", "Briefing", "Writes today's briefing from the numbers and voices it."],
  ["scout", "Scout", "Finds Roblox creators to partner with and drafts the first message."],
  ["studio", "Studio", "Writes and renders the day's videos for review."],
  ["publisher", "Publisher", "Posts approved videos to TikTok, Shorts and X."],
  ["watchdog", "Watchdog", "Pauses any account whose reach drops."],
];

export default async function Machine() {
  const d = await getDashboard(7);
  const online = d.runs.some((r) => r.status === "done");
  return (
    <Shell online={online}>
      <div className="page">
        <Header title="The machine" sub="Six jobs. Two are live, four are coming." showRanges={false} />
        <div className="agents" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {AGENTS.map(([job, name, task]) => {
            const r = d.runs.find((x) => x.job === job);
            const st = !r ? "off" : r.status === "done" ? "done" : r.status === "failed" ? "fail" : "run";
            const txt = { off: "Not built yet", done: "Done", fail: "Failed", run: "Running" }[st];
            return (
              <div key={job} className={`agent ${st === "off" ? "off" : ""}`}>
                <div className="top"><b>{name}</b><span className={`state ${st}`}><i />{txt}</span></div>
                <span className="task">{task}</span>
                <span className="when">{r ? `Last ran ${whenFull(r.finished_at || r.started_at)}` : "Coming next"}</span>
                {r?.status === "failed" && r.error && <span className="task" style={{ color: "#F8A3A8" }}>{String(r.error).slice(-220)}</span>}
              </div>
            );
          })}
        </div>
        <section className="block">
          <div className="bhead"><h2>Activity</h2></div>
          <div className="feed">
            {d.events.length ? d.events.map((e, i) => <div key={i}>{e.message}<small>{e.agent.charAt(0) + e.agent.slice(1).toLowerCase()}, {whenFull(e.created_at)}</small></div>)
                             : <div className="empty">Nothing has run yet. The first job starts at 7am.</div>}
          </div>
        </section>
      </div>
      <Ask />
    </Shell>
  );
}
