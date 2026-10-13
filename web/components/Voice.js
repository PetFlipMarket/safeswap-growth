"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const Ctx = createContext(null);
export const useVoice = () => useContext(Ctx);
const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

// One voice engine. The phone is the microphone (it sends questions), the laptop is the speaker.
// Sound goes through Web Audio so it can be unlocked once, started later, and measured for the waveform.
export function VoiceProvider({ children, briefing }) {
  const [state, setState] = useState("idle"); // idle | listening | sent | thinking | loading | speaking | briefing
  const [synthetic, setSynthetic] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");
  const ctxRef = useRef(null), analyserRef = useRef(null), queue = useRef([]), startRef = useRef(0), durRef = useRef(0);
  const token = useRef(0), kokoro = useRef(null), recRef = useRef(null), pending = useRef(null), history = useRef([]);
  const id = useRef(Math.random().toString(36).slice(2));

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
    token.current++;
    for (const s of queue.current) { try { s.stop(); } catch {} }
    queue.current = [];
    window.speechSynthesis?.cancel();
    setSynthetic(false); setState("idle");
  }, []);

  // Make sure the laptop is allowed to make sound; if not, show the one-time button and remember what to do.
  const ready = useCallback(async (retry) => {
    const c = ensureCtx(); await c.resume().catch(() => {});
    if (c.state === "running") return c;
    pending.current = retry; setNeedsUnlock(true); setState("idle"); return null;
  }, [ensureCtx]);

  const schedule = useCallback((c, buffer, kind, myToken, at) => {
    const s = c.createBufferSource(); s.buffer = buffer; s.connect(analyserRef.current);
    const start = Math.max(at, c.currentTime + 0.02); s.start(start);
    queue.current.push(s);
    s.onended = () => {
      queue.current = queue.current.filter((x) => x !== s);
      if (myToken === token.current && queue.current.length === 0) setState("idle");
    };
    setSynthetic(false); setState(kind);
    return start + buffer.duration;
  }, []);

  const playBriefing = useCallback(async () => {
    if (state === "briefing") return stop();
    const c = await ready(() => playBriefing()); if (!c) return;
    stop(); const my = ++token.current; setState("thinking");
    try {
      const r = await fetch("/api/audio"); if (!r.ok) throw new Error();
      const buf = await c.decodeAudioData(await r.arrayBuffer());
      if (my !== token.current) return;
      startRef.current = c.currentTime; durRef.current = buf.duration;
      schedule(c, buf, "briefing", my, c.currentTime);
    } catch { setState("idle"); }
  }, [state, stop, ready, schedule]);

  const localVoice = useCallback(async () => {
    if (kokoro.current) return kokoro.current;
    setState("loading");
    const m = await import(/* webpackIgnore: true */ KOKORO_URL);
    kokoro.current = await m.KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: "q8", device: "wasm" });
    return kokoro.current;
  }, []);

  const speakText = useCallback(async (text) => {
    const c = await ready(() => speakText(text)); if (!c) return;
    stop(); const my = ++token.current;
    // 1. A server voice, if a key is configured.
    try {
      const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (r.ok) { const buf = await c.decodeAudioData(await r.arrayBuffer()); if (my === token.current) schedule(c, buf, "speaking", my, c.currentTime); return; }
    } catch {}
    // 2. Adam, generated on this laptop, one sentence at a time so it starts quickly.
    try {
      const tts = await localVoice(); if (my !== token.current) return;
      const parts = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [text];
      let at = c.currentTime + 0.05; setState("thinking");
      for (const p of parts) {
        const s = p.trim(); if (!s) continue;
        const a = await tts.generate(s, { voice: "am_adam", speed: 1.05 });
        if (my !== token.current) return;
        const buf = c.createBuffer(1, a.audio.length, a.sampling_rate); buf.copyToChannel(a.audio, 0);
        at = schedule(c, buf, "speaking", my, at);
      }
      return;
    } catch (e) { console.warn("local voice unavailable", e); }
    // 3. The browser's own voice.
    if (!("speechSynthesis" in window)) return setState("idle");
    const u = new SpeechSynthesisUtterance(text);
    const vs = window.speechSynthesis.getVoices();
    u.voice = vs.find((v) => /en-(US|GB)/i.test(v.lang) && /male|daniel|aaron|alex|fred|george|arthur/i.test(v.name)) || vs.find((v) => /en-US/i.test(v.lang)) || null;
    u.rate = 1.03; u.onend = () => { setSynthetic(false); setState("idle"); }; u.onerror = u.onend;
    setSynthetic(true); setState("speaking"); window.speechSynthesis.speak(u);
  }, [ready, stop, schedule, localVoice]);

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

  const sendRemote = useCallback(async (cmd, text) => {
    await fetch("/api/remote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd, text: text || "", src: id.current }) }).catch(() => {});
  }, []);

  // Listen. On the phone the words go to the laptop; on the laptop they're answered here.
  const listen = useCallback(() => {
    if (state === "speaking" || state === "briefing") return stop();
    if (state === "listening") return recRef.current?.stop();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    if (!isTouch) ensureCtx();
    const r = new SR(); r.lang = "en-GB"; r.interimResults = false; r.maxAlternatives = 1;
    let text = "";
    r.onresult = (e) => { text = Array.from(e.results).map((x) => x[0].transcript).join(" "); };
    r.onerror = () => setState("idle");
    r.onend = async () => {
      if (!text) return setState((s) => (s === "listening" ? "idle" : s));
      if (isTouch) { await sendRemote("ask", text); setState("sent"); setTimeout(() => setState((s) => (s === "sent" ? "idle" : s)), 2500); }
      else ask(text);
    };
    recRef.current = r; setState("listening"); r.start();
  }, [state, stop, isTouch, ensureCtx, sendRemote, ask]);

  // The laptop checks for commands from the phone.
  useEffect(() => {
    if (isTouch) return;
    let last = 0, timer;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const j = await (await fetch(`/api/remote?after=${last}`)).json();
        last = j.last || last;
        const cmds = (j.cmds || []).filter((c) => c.src !== id.current);
        const c = cmds[cmds.length - 1]; if (!c) return;
        if (c.cmd === "stop") stop();
        else if (c.cmd === "play") playBriefing();
        else if (c.cmd === "ask" && c.text) ask(c.text);
      } catch {}
    };
    tick(); timer = setInterval(tick, 1500);
    return () => clearInterval(timer);
  }, [isTouch, playBriefing, ask, stop]);

  const unlock = useCallback(async () => {
    const c = ensureCtx(); await c.resume().catch(() => {});
    setNeedsUnlock(false);
    const p = pending.current; pending.current = null; if (p) p();
  }, [ensureCtx]);

  const progress = () => {
    const c = ctxRef.current; if (!c || state !== "briefing" || !durRef.current) return { t: 0, d: 0 };
    return { t: Math.min(durRef.current, c.currentTime - startRef.current), d: durRef.current };
  };

  const value = { state, synthetic, isTouch, needsUnlock, lastAnswer, briefing, analyser: analyserRef, playBriefing, speakText, ask, listen, stop, sendRemote, unlock, progress };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
