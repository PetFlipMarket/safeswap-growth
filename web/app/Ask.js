"use client";
import { useEffect, useRef, useState } from "react";

const SUGGEST = ["How many new users yesterday?", "Where are new users coming from this week?", "What did people search for but not find?", "Which creator code is doing best?"];

export default function Ask() {
  const [state, setState] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [typed, setTyped] = useState("");
  const [canListen, setCanListen] = useState(false);
  const rec = useRef(null);
  const history = useRef([]);

  useEffect(() => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setCanListen(!!SR);
  }, []);

  const speak = (text) => {
    if (!("speechSynthesis" in window)) { setState("idle"); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = window.speechSynthesis.getVoices().find((x) => /en-GB/i.test(x.lang) && /male|daniel|arthur|george/i.test(x.name))
      || window.speechSynthesis.getVoices().find((x) => /en-GB/i.test(x.lang));
    if (v) u.voice = v;
    u.lang = "en-GB"; u.rate = 1.03;
    u.onend = () => setState("idle");
    setState("speaking");
    window.speechSynthesis.speak(u);
  };

  const ask = async (q) => {
    if (!q.trim()) return;
    setHeard(q); setAnswer(""); setState("thinking");
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history: history.current }) });
      const j = await r.json();
      const a = j.answer || "No answer.";
      history.current = [...history.current, { role: "user", content: q }, { role: "assistant", content: a }].slice(-8);
      setAnswer(a); speak(a);
    } catch {
      setAnswer("Couldn't reach the machine."); setState("idle");
    }
  };

  const listen = () => {
    if (state === "speaking") { window.speechSynthesis.cancel(); setState("idle"); return; }
    if (state === "listening") { rec.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance("")); // unlocks audio on iPhone
    const r = new SR();
    r.lang = "en-GB"; r.interimResults = true; r.maxAlternatives = 1;
    let finalText = "";
    r.onresult = (e) => {
      let t = "";
      for (const res of e.results) t += res[0].transcript;
      setHeard(t);
      if (e.results[e.results.length - 1].isFinal) finalText = t;
    };
    r.onerror = () => setState("idle");
    r.onend = () => { if (finalText) ask(finalText); else setState((s) => (s === "listening" ? "idle" : s)); };
    rec.current = r;
    setHeard(""); setAnswer(""); setState("listening");
    r.start();
  };

  const label = { idle: "Tap and ask", listening: "Listening… tap to stop", thinking: "Checking the numbers…", speaking: "Speaking… tap to stop" }[state];

  return (
    <section className="card askcard" aria-label="Ask the machine">
      <button type="button" className={`mic ${state}`} onClick={listen} disabled={!canListen || state === "thinking"}
        aria-label={state === "listening" ? "Stop listening" : "Ask a question out loud"}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v4" />
        </svg>
      </button>
      <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="label" style={{ color: "var(--purple2)" }}>{canListen ? label.toUpperCase() : "TYPE A QUESTION"}</div>
        {heard && <div style={{ fontSize: 18, color: "#CFCBE3" }}>“{heard}”</div>}
        {answer && <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.45 }}>{answer}</div>}
        {!heard && !answer && (
          <div className="chips">
            {SUGGEST.map((s) => <button key={s} type="button" className="chip" onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); ask(typed); setTyped(""); }} style={{ display: "flex", gap: 8 }}>
          <label htmlFor="askq" className="sr">Question</label>
          <input id="askq" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type a question…" className="askin" />
          <button type="submit" className="askgo" disabled={state === "thinking"}>Ask</button>
        </form>
      </div>
    </section>
  );
}
