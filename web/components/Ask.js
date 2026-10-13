"use client";
import { useEffect, useRef, useState } from "react";

export default function Ask() {
  const [state, setState] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [typed, setTyped] = useState("");
  const [canListen, setCanListen] = useState(false);
  const rec = useRef(null);
  const history = useRef([]);

  useEffect(() => { setCanListen(!!(window.SpeechRecognition || window.webkitSpeechRecognition)); }, []);

  const speak = (text) => {
    if (!("speechSynthesis" in window)) return setState("idle");
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const vs = window.speechSynthesis.getVoices();
    u.voice = vs.find((v) => /en-GB/i.test(v.lang) && /daniel|arthur|george|male/i.test(v.name)) || vs.find((v) => /en-GB/i.test(v.lang)) || null;
    u.lang = "en-GB"; u.rate = 1.03;
    u.onend = () => setState("idle"); u.onerror = () => setState("idle");
    setState("speaking"); window.speechSynthesis.speak(u);
  };

  const ask = async (q) => {
    q = q.trim(); if (!q) return;
    setHeard(q); setAnswer(""); setState("thinking");
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history: history.current }) });
      const j = await r.json(); const a = j.answer || "No answer came back.";
      history.current = [...history.current, { role: "user", content: q }, { role: "assistant", content: a }].slice(-8);
      setAnswer(a); speak(a);
    } catch { setAnswer("Couldn't reach the machine. Try again."); setState("idle"); }
  };

  const mic = () => {
    if (state === "speaking") { window.speechSynthesis.cancel(); return setState("idle"); }
    if (state === "listening") return rec.current?.stop();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
    const r = new SR(); r.lang = "en-GB"; r.interimResults = true;
    let finalText = "";
    r.onresult = (e) => { let s = ""; for (const x of e.results) s += x[0].transcript; setHeard(s); if (e.results[e.results.length - 1].isFinal) finalText = s; };
    r.onerror = () => setState("idle");
    r.onend = () => { finalText ? ask(finalText) : setState((s) => (s === "listening" ? "idle" : s)); };
    rec.current = r; setHeard(""); setAnswer(""); setState("listening"); r.start();
  };

  const placeholder = { idle: "Ask the machine", listening: "Listening…", thinking: "Checking the numbers…", speaking: "Tap the mic to stop" }[state];

  return (
    <div className="ask">
      <div className="box">
        {(heard || answer) && (
          <div className="reply" role="status" aria-live="polite">
            {heard && <div className="q">{heard}</div>}
            {answer ? <div className="ans">{answer}</div> : state === "thinking" ? <div className="ans" style={{ color: "var(--dust)" }}>Checking the numbers…</div> : null}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); ask(typed); setTyped(""); }}>
          <button type="button" className={`mic ${state}`} onClick={mic} disabled={!canListen || state === "thinking"}
            aria-label={state === "listening" ? "Stop listening" : state === "speaking" ? "Stop talking" : "Ask by voice"}>
            {state === "thinking"
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>}
          </button>
          <label htmlFor="askq" className="sr">Question</label>
          <input id="askq" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={placeholder} autoComplete="off" />
          <button type="submit" className="go" disabled={state === "thinking" || !typed.trim()}>Ask</button>
        </form>
      </div>
    </div>
  );
}
