"use client";
import { useEffect, useState } from "react";
import Mark from "./Mark";
import { useVoice } from "./Voice";

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Briefing({ hasAudio, headline, plan, dateLabel, madeAt }) {
  const v = useVoice();
  const playing = v.state === "briefing";
  const [{ t, d }, setP] = useState({ t: 0, d: 0 });
  useEffect(() => {
    if (!playing) return;
    const i = setInterval(() => setP(v.progress()), 250);
    return () => clearInterval(i);
  }, [playing, v]);

  return (
    <section className="panel brief" aria-label="Today's briefing">
      <div>
        <button type="button" className={`mark-btn ${playing ? "talking" : ""}`} onClick={v.playBriefing} disabled={!hasAudio}
          aria-label={playing ? "Stop the briefing" : "Play today's briefing"}>
          <Mark size={200} />
        </button>
        <p className="meta" style={{ textAlign: "center", margin: "14px 0 0" }}>
          {!hasAudio ? "No briefing yet" : playing ? "Talking. Tap to stop." : "Tap to hear today's briefing"}
        </p>
      </div>
      <div>
        <div className="meta">{dateLabel}{dateLabel && madeAt ? ` at ${madeAt}` : ""}</div>
        <h2 className="head">{headline || "Your first briefing arrives at 7am."}</h2>
        <div className="player">
          <button type="button" className="play" onClick={v.playBriefing} disabled={!hasAudio} aria-label={playing ? "Stop" : "Play"}>
            {playing
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5z" /></svg>}
          </button>
          <div className="scrub" aria-hidden="true"><i style={{ width: d ? `${(t / d) * 100}%` : 0 }} /></div>
          <span className="time num">{d ? `${mmss(t)} / ${mmss(d)}` : ""}</span>
        </div>
        {plan?.length > 0 && (
          <>
            <div className="plan-title">Today's plan</div>
            <ol className="plan">{plan.map((p, i) => <li key={i}><b>{i + 1}</b><span>{p}</span></li>)}</ol>
          </>
        )}
      </div>
    </section>
  );
}
