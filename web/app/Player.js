"use client";
import { useRef, useState } from "react";

export default function Player({ hasAudio }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { a.play(); } else { a.pause(); }
  };

  return (
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
        <audio ref={audio} src="/api/audio" preload="none"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      )}
    </div>
  );
}
