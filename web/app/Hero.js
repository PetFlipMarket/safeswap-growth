"use client";
import { useMemo, useRef, useState } from "react";

export default function Hero({ hasAudio, text, headline, dayLabel }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0);
  const words = useMemo(() => (text || "").split(/\s+/).filter(Boolean), [text]);
  const idx = Math.floor(prog * words.length);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    a.paused ? a.play() : a.pause();
  };
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const dur = audio.current?.duration || 0;

  return (
    <section className="card hero" aria-label="Morning briefing">
      <div className="orbcol">
        <div className="orb">
          {playing && <><div className="wave" /><div className="wave b" /></>}
          <div className="r1" /><div className="r2" /><div className="r3" />
          <button type="button" className="orbbtn" onClick={toggle} disabled={!hasAudio}
            aria-label={playing ? "Pause briefing" : "Play today's briefing"}>
            {playing ? (
              <div className="bars" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} style={{ animationDelay: `${i * 0.09}s`, animationDuration: `${0.6 + (i % 3) * 0.18}s` }} />)}
              </div>
            ) : (
              <svg width="58" height="58" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5z" /></svg>
            )}
            <span className="label">{hasAudio ? (playing ? "SPEAKING" : "PLAY BRIEFING") : "NO BRIEFING YET"}</span>
          </button>
        </div>
        {hasAudio && (
          <audio ref={audio} src="/api/audio" preload="metadata"
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setProg(1); }}
            onTimeUpdate={(e) => { const a = e.currentTarget; if (a.duration) setProg(a.currentTime / a.duration); }} />
        )}
      </div>
      <div style={{ flex: "1 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div className="label" style={{ color: "var(--purple2)" }}>DAILY BRIEFING · {dayLabel}</div>
          {hasAudio && <div className="mono muted" style={{ fontSize: 14 }}>{mmss(prog * dur)} / {mmss(dur)}</div>}
        </div>
        <h1 style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.05 }}>{headline || "Morning, Ethan."}</h1>
        {words.length ? (
          <p className="transcript" style={{ margin: 0 }}>
            {words.map((w, i) => (
              <span key={i} className={i === idx && playing ? "w now" : i < idx ? "w said" : "w"}>{w} </span>
            ))}
          </p>
        ) : <p className="empty">The first briefing appears after the 7am job runs.</p>}
        <div className="track" style={{ height: 4 }}><div className="fill" style={{ height: 4, width: `${prog * 100}%` }} /></div>
      </div>
    </section>
  );
}
