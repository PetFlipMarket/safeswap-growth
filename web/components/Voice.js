"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const Ctx = createContext(null);
export const useVoice = () => useContext(Ctx);

// One voice engine for the whole app. All sound goes through Web Audio so it can be
// unlocked once by a tap, started later after a fetch (iPhone-safe), and measured for the waveform.
export function VoiceProvider({ children, briefing }) {
  const [state, setState] = useState("idle"); // idle | listening | thinking | speaking | briefing
  const [synthetic, setSynthetic] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");
  const ctxRef = useRef(null), analyserRef = useRef(null), srcRef = useRef(null), startRef = useRef(0), durRef = useRef(0);
  const history = useRef([]);
  const id = useRef(Math.random().toString(36).slice(2));
  const pendingRemote = useRef(null);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
    const unlock = () => { ensureCtx(); };
    document.addEventListener("pointerdown", unlock, { once: true, passive: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const c = new AC();
      const a = c.createAnalyser(); a.fftSize = 2048; a.smoothingTimeConstant = 0.6; a.connect(c.destination);
      ctxRef.current = c; analyserRef.current = a;
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume().catch(() => {});
    return ctxRef.current;
  }, []);

  const stop = useCallback(() => {
    try { srcRef.current?.stop(); } catch {}
    srcRef.current = null;
    window.speechSynthesis?.cancel();
    setSynthetic(false); setState("idle");
  }, []);

  const playBuffer = useCallback(async (buf, kind) => {
    const c = ensureCtx();
    await c.resume().catch(() => {});
    if (c.state !== "running") { setNeedsUnlock(true); pendingRemote.current = () => playBuffer(buf, kind); setState("idle"); return; }
    const audio = await c.decodeAudioData(buf.slice(0));
    try { srcRef.current?.stop(); } catch {}
    const s = c.createBufferSource(); s.buffer = audio; s.connect(analyserRef.current);
    s.onended = () => { if (srcRef.current === s) { srcRef.current = null; setState("idle"); } };
    srcRef.current = s; startRef.current = c.currentTime; durRef.current = audio.duration;
    setSynthetic(false); setState(kind); s.start();
  }, [ensureCtx]);

  const playBriefing = useCallback(async () => {
    if (state === "briefing") return stop();
    ensureCtx(); setState("thinking");
    try {
      const r = await fetch("/api/audio"); if (!r.ok) throw new Error();
      await playBuffer(await r.arrayBuffer(), "briefing");
    } catch { setState("idle"); }
  }, [state, stop, ensureCtx, playBuffer]);

  const speakText = useCallback(async (text) => {
    ensureCtx();
    try {
      const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (r.ok) return playBuffer(await r.arrayBuffer(), "speaking");
    } catch {}
    if (!("speechSynthesis" in window)) return setState("idle");
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const vs = window.speechSynthesis.getVoices();
    u.voice = vs.find((v) => /en-US/i.test(v.lang) && /male|daniel|aaron|alex|fred/i.test(v.name)) || vs.find((v) => /en-US/i.test(v.lang)) || null;
    u.rate = 1.03; u.onend = () => { setSynthetic(false); setState("idle"); }; u.onerror = u.onend;
    setSynthetic(true); setState("speaking"); window.speechSynthesis.speak(u);
  }, [ensureCtx, playBuffer]);

  const ask = useCallback(async (q) => {
    q = (q || "").trim(); if (!q) return setState("idle");
    setState("thinking");
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history: history.current }) });
      const j = await r.json(); const a = j.answer || "No answer came back.";
      history.current = [...history.current, { role: "user", content: q }, { role: "assistant", content: a }].slice(-8);
      setLastAnswer(a); await speakText(a);
    } catch { setLastAnswer("Couldn't reach the machine. Try again."); setState("idle"); }
  }, [speakText]);

  const listen = useCallback(() => {
    if (state === "speaking" || state === "briefing") return stop();
    if (state === "listening") return recRef.current?.stop();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    ensureCtx();
    const r = new SR(); r.lang = "en-GB"; r.interimResults = false; r.maxAlternatives = 1;
    let text = "";
    r.onresult = (e) => { text = Array.from(e.results).map((x) => x[0].transcript).join(" "); };
    r.onerror = () => setState("idle");
    r.onend = () => { text ? ask(text) : setState((s) => (s === "listening" ? "idle" : s)); };
    recRef.current = r; setState("listening"); r.start();
  }, [state, stop, ensureCtx, ask]);
  const recRef = useRef(null);

  // Remote: the phone sends "play", an open laptop picks it up.
  const sendRemote = useCallback(async (cmd) => {
    await fetch("/api/remote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd, src: id.current }) }).catch(() => {});
  }, []);
  useEffect(() => {
    if (isTouch || !briefing?.hasAudio) return;
    let last = 0, timer;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const j = await (await fetch(`/api/remote?after=${last}`)).json();
        const cmds = (j.cmds || []).filter((c) => c.src !== id.current);
        last = j.last || last;
        if (cmds.some((c) => c.cmd === "stop")) stop();
        else if (cmds.some((c) => c.cmd === "play")) playBriefing();
      } catch {}
    };
    tick(); timer = setInterval(tick, 2500);
    return () => clearInterval(timer);
  }, [isTouch, briefing?.hasAudio, playBriefing, stop]);

  const unlock = useCallback(async () => {
    const c = ensureCtx(); await c.resume().catch(() => {});
    setNeedsUnlock(false);
    const p = pendingRemote.current; pendingRemote.current = null; if (p) p();
  }, [ensureCtx]);

  const progress = () => {
    const c = ctxRef.current; if (!c || !srcRef.current || !durRef.current) return { t: 0, d: 0 };
    return { t: Math.min(durRef.current, c.currentTime - startRef.current), d: durRef.current };
  };

  const value = { state, synthetic, isTouch, needsUnlock, lastAnswer, briefing, analyser: analyserRef, playBriefing, speakText, ask, listen, stop, sendRemote, unlock, progress };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
