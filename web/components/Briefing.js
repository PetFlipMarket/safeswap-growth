"use client";
import { useRef, useState } from "react";

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Briefing({ hasAudio, headline, plan, dateLabel, madeAt }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    a.paused ? a.play() : a.pause();
  };

  const label = !hasAudio ? "No briefing yet" : playing ? "Talking — tap to pause" : "Tap to hear today's briefing";

  return (
    <section className="panel brief" aria-label="Today's briefing">
      <div>
        <button type="button" className={`bot ${playing ? "talking" : ""}`} onClick={toggle} disabled={!hasAudio} aria-label={label}>
          <span className="halo" aria-hidden="true" />
          <img src="/robot.jpg" alt="" />
          <span className="eye l" aria-hidden="true" /><span className="eye r" aria-hidden="true" />
        </button>
        <p className="meta" style={{ textAlign: "center", margin: "16px 0 0" }}>{label}</p>
        {hasAudio && (
          <audio ref={audio} src="/api/audio" preload="metadata"
            onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setT(dur); }}
            onTimeUpdate={(e) => { setT(e.currentTarget.currentTime); if (e.currentTarget.duration) setDur(e.currentTarget.duration); }} />
        )}
      </div>
      <div>
        <div className="meta">{dateLabel}{dateLabel && madeAt ? ` at ${madeAt}` : ""}</div>
        <h2 className="head">{headline || "Your first briefing arrives at 7am."}</h2>
        <div className="player">
          <button type="button" className="play" onClick={toggle} disabled={!hasAudio} aria-label={playing ? "Pause" : "Play"}>
            {playing
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5z" /></svg>}
          </button>
          <div className="scrub" aria-hidden="true"><i style={{ width: dur ? `${(t / dur) * 100}%` : 0 }} /></div>
          <span className="time num">{dur ? `${mmss(t)} / ${mmss(dur)}` : ""}</span>
        </div>
        {plan?.length > 0 && (
          <>
            <div className="plan-title">Today's plan</div>
            <ol className="plan">
              {plan.map((p, i) => <li key={i}><b>{i + 1}</b><span>{p}</span></li>)}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
