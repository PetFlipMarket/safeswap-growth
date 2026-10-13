"use client";
import { useEffect, useRef } from "react";
import { useVoice } from "./Voice";

// The worker's screen. Comes up the moment a question lands on the laptop:
// the question, a wheel and the steps while it works, then the line while it talks.
export default function Stage() {
  const v = useVoice();
  const canvas = useRef(null);
  const s = v.state;
  const talking = s === "speaking" || s === "briefing";
  const working = s === "thinking" || s === "loading";
  const on = talking || working || !!v.job?.error;
  const job = v.job;

  useEffect(() => {
    if (!talking) return;
    const cv = canvas.current, g = cv.getContext("2d");
    let raf, t0 = performance.now();
    const data = new Uint8Array(2048);
    const draw = (now) => {
      const W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const mid = H / 2, amp = Math.min(H * 0.34, 180), N = 240, pts = [];
      const an = v.analyser.current;
      if (an && !v.synthetic) {
        an.getByteTimeDomainData(data);
        for (let i = 0; i < N; i++) {
          let sum = 0; const a = Math.floor((i / N) * data.length), b = Math.floor(((i + 1) / N) * data.length);
          for (let k = a; k < b; k++) sum += (data[k] - 128) / 128;
          pts.push(sum / Math.max(1, b - a));
        }
      } else {
        const k = (now - t0) / 1000;
        for (let i = 0; i < N; i++) { const x = i / N; pts.push(0.35 * Math.sin(x * 14 + k * 6) * Math.sin(x * 3.1 + k * 2.2) * (0.6 + 0.4 * Math.sin(k * 9))); }
      }
      const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, "#F0EEE6"); grad.addColorStop(1, "#D97757");
      g.lineWidth = 3; g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = grad; g.shadowColor = "rgba(217,119,87,.5)"; g.shadowBlur = 18;
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * W, env = Math.sin((i / (N - 1)) * Math.PI);
        const y = mid - pts[i] * amp * 2.2 * env;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [talking, v]);

  useEffect(() => {
    if (!on) return;
    const key = (e) => { if (e.key === "Escape") v.stop(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [on, v]);

  if (!on) return null;
  const steps = job?.steps || [];
  const err = job?.error;
  return (
    <div className={`stage ${talking ? "talking" : "working"}`} onClick={v.stop} role="dialog" aria-label={talking ? "The machine is speaking. Tap to stop." : "The machine is working. Tap to cancel."}>
      {talking && <canvas ref={canvas} />}
      <div className="stage-log" aria-live="polite">
        {job?.question && <div className="stage-q"><span>{s === "briefing" ? "Playing" : "Heard"}</span>{job.question}</div>}
        {!talking && !err && <div className="stage-wheel" aria-hidden="true"><span /></div>}
        <ol>
          {steps.map((t, i) => {
            const last = i === steps.length - 1;
            const live = last && working;
            return (
              <li key={i} className={live ? "live" : "done"}>
                <i aria-hidden="true" />
                <span>{t}{live && job?.pct != null ? ` · ${job.pct}%` : ""}</span>
              </li>
            );
          })}
          {working && steps.length === 0 && <li className="live"><i aria-hidden="true" /><span>Picking it up</span></li>}
          {talking && <li className="live"><i aria-hidden="true" /><span>{s === "briefing" ? "Playing the briefing" : "Talking"}</span></li>}
        </ol>
        {err && <div className="stage-err">{err}</div>}
      </div>
      <span className="stage-hint">{talking ? "tap to stop" : err ? "tap to close" : "tap to cancel"}</span>
    </div>
  );
}
