"use client";
import { useRef, useState } from "react";

export default function Hero({ hasAudio, headline, dayLabel }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0);
  const [dur, setDur] = useState(0);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    a.paused ? a.play() : a.pause();
  };
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <section className="card hero" aria-label="Morning briefing">
      <div className="botcol">
        <button type="button" className={`bot ${playing ? "talking" : ""}`} onClick={toggle} disabled={!hasAudio}
          aria-label={playing ? "Pause briefing" : "Play today's briefing"}>
          <span className="botring" aria-hidden="true" />
          <span className="botring b" aria-hidden="true" />
          <img src="/robot.jpg" alt="" />
          <span className="eye l" aria-hidden="true" />
          <span className="eye r" aria-hidden="true" />
          <span className="scan" aria-hidden="true" />
        </button>
        <div className="botlabel">
          {playing ? (
            <div className="eq" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <span key={i} style={{ animationDelay: `${i * 0.07}s` }} />)}</div>
          ) : null}
          <span className="label">{hasAudio ? (playing ? "TALKING · TAP TO PAUSE" : "TAP ME FOR TODAY'S BRIEFING") : "NO BRIEFING YET"}</span>
        </div>
        {hasAudio && (
          <audio ref={audio} src="/api/audio" preload="metadata"
            onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setProg(1); }}
            onTimeUpdate={(e) => { const a = e.currentTarget; if (a.duration) { setProg(a.currentTime / a.duration); setDur(a.duration); } }} />
        )}
      </div>
      <div style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div className="label" style={{ color: "var(--purple2)" }}>DAILY BRIEFING · {dayLabel}</div>
          {hasAudio && <div className="mono muted" style={{ fontSize: 14 }}>{mmss(prog * dur)} / {mmss(dur)}</div>}
        </div>
        <h1 style={{ fontSize: "clamp(34px, 5vw, 54px)", fontWeight: 900, lineHeight: 1.02 }}>{headline || "Morning, Ethan."}</h1>
        <div className="track" style={{ height: 6 }}><div className="fill" style={{ height: 6, width: `${prog * 100}%`, transition: "width .25s linear" }} /></div>
      </div>
    </section>
  );
}
