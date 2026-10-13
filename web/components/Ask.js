"use client";
import { useEffect, useState } from "react";
import { useVoice } from "./Voice";

// Desktop ask bar. Type or talk; the answer is spoken on the stage.
export default function Ask() {
  const v = useVoice();
  const [typed, setTyped] = useState("");
  const [canListen, setCanListen] = useState(false);
  useEffect(() => { setCanListen(!!(window.SpeechRecognition || window.webkitSpeechRecognition)); }, []);
  const s = v.state;
  const placeholder = { idle: "Ask the machine", listening: "Listening…", thinking: "Checking the numbers…", speaking: "Talking…", briefing: "Playing the briefing…" }[s];
  return (
    <div className="ask desk-only">
      <div className="box">
        {v.lastAnswer && s === "idle" && <div className="reply" role="status"><div className="ans">{v.lastAnswer}</div></div>}
        <form onSubmit={(e) => { e.preventDefault(); v.ask(typed); setTyped(""); }}>
          <button type="button" className={`mic ${s}`} onClick={v.listen} disabled={!canListen || s === "thinking"}
            aria-label={s === "listening" ? "Stop listening" : s === "speaking" || s === "briefing" ? "Stop talking" : "Ask by voice"}>
            {s === "thinking"
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>}
          </button>
          <label htmlFor="askq" className="sr">Question</label>
          <input id="askq" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={placeholder} autoComplete="off" />
          <button type="submit" className="go" disabled={s === "thinking" || !typed.trim()}>Ask</button>
        </form>
      </div>
    </div>
  );
}
