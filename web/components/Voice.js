"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const Ctx = createContext(null);
export const useVoice = () => useContext(Ctx);
const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

// One voice engine. The phone is the microphone (it sends questions); the laptop is the worker and the speaker.
// Every job carries a token. A newer job bumps the token, so anything older stops at its next step.
export function VoiceProvider({ children, briefing }) {
  const [state, setState] = useState("idle"); // idle | listening | sent | thinking | loading | speaking | briefing
  const [synthetic, setSynthetic] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [lastAnswer, setLastAnswer] = useState("");
  const [remoteStatus, setRemoteStatus] = useState("");
  const [job, setJob] = useState(null); // { question, steps: [string], pct?, error? }
  const ctxRef = useRef(null), analyserRef = useRef(null), queue = useRef([]), startRef = useRef(0), durRef = useRef(0);
  const token = useRef(0), kokoro = useRef(null), recRef = useRef(null), pending = useRef(null), history = useRef([]);
  const abort = useRef(null), waiting = useRef(0);
  const id = useRef(Math.random().toString(36).slice(2));

  const isRemote = () => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
  useEffect(() => {
    setIsTouch(isRemote());
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

  const sendRemote = useCallback(async (cmd, text) => {
    await fetch("/api/remote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd, text: text || "", src: id.current }) }).catch(() => {});
  }, []);

  // Drop whatever is running: sound, generation, requests. Returns the new token.
  const cancel = useCallback(() => {
    token.current++;
    abort.current?.abort(); abort.current = null;
    for (const s of queue.current) { try { s.stop(); } catch {} }
    queue.current = [];
    window.speechSynthesis?.cancel();
    setSynthetic(false);
    return token.current;
  }, []);
  const stop = useCallback(() => { cancel(); setJob(null); setState("idle"); }, [cancel]);
  const step = useCallback((my, text) => { if (my === token.current) setJob((j) => (j ? { ...j, steps: [...j.steps, text] } : j)); }, []);
  const fail = useCallback((my, text) => {
    if (my !== token.current) return;
    setJob((j) => ({ ...(j || { question: "", steps: [] }), error: text })); setState("idle");
    sendRemote("status", "error: " + text);
    setTimeout(() => { if (my === token.current) setJob(null); }, 9000);
  }, [sendRemote]);

  // Make sure the laptop is allowed to make sound; if not, show the one-time button and remember what to do.
  const ready = useCallback(async (retry) => {
    const c = ensureCtx(); await c.resume().catch(() => {});
    if (c.state === "running") return c;
    pending.current = retry; setNeedsUnlock(true); return null;
  }, [ensureCtx]);

  const schedule = useCallback((c, buffer, kind, my, at) => {
    const s = c.createBufferSource(); s.buffer = buffer; s.connect(analyserRef.current);
    const start = Math.max(at, c.currentTime + 0.02); s.start(start);
    if (queue.current.length === 0) sendRemote("status", kind === "briefing" ? "briefing" : "speaking");
    queue.current.push(s);
    s.onended = () => {
      queue.current = queue.current.filter((x) => x !== s);
      if (my === token.current && queue.current.length === 0) { setState("idle"); setJob(null); sendRemote("status", "done"); }
    };
    setSynthetic(false); setState(kind);
    return start + buffer.duration;
  }, [sendRemote]);

  const playBriefing = useCallback(async () => {
    if (isRemote()) return sendRemote("play");
    if (state === "briefing") return stop();
    const c = await ready(() => playBriefing()); if (!c) return;
    const my = cancel();
    setJob({ question: "Today's briefing", steps: ["Fetching this morning's briefing"] }); setState("thinking");
    try {
      const r = await fetch("/api/audio"); if (!r.ok) throw new Error("There's no briefing recorded yet");
      const buf = await c.decodeAudioData(await r.arrayBuffer());
      if (my !== token.current) return;
      startRef.current = c.currentTime; durRef.current = buf.duration;
      schedule(c, buf, "briefing", my, c.currentTime);
    } catch (e) { fail(my, e.message || "Couldn't play the briefing"); }
  }, [state, stop, cancel, ready, schedule, fail, sendRemote]);

  const localVoice = useCallback(async (my) => {
    if (kokoro.current) return kokoro.current;
    setState("loading"); step(my, "Getting Adam's voice ready (one-off download)"); sendRemote("status", "loading");
    const m = await import(/* webpackIgnore: true */ KOKORO_URL);
    const tts = await m.KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype: "q8", device: "wasm",
      progress_callback: (p) => { if (p.status === "progress" && my === token.current) setJob((j) => (j ? { ...j, pct: Math.round(p.progress || 0) } : j)); },
    });
    kokoro.current = tts; setJob((j) => (j ? { ...j, pct: undefined } : j));
    return tts;
  }, [step, sendRemote]);

  // Speak a finished answer. `my` is the job's token; if a newer job started, this one quietly stops.
  const speakText = useCallback(async (text, my = token.current) => {
    if (isRemote()) return setState("idle"); // a phone never speaks; the laptop does
    const c = await ready(() => speakText(text, my)); if (!c) return;
    if (my !== token.current) return;
    // 1. A server voice, if a key is configured.
    try {
      const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: abort.current?.signal });
      if (r.ok) { const buf = await c.decodeAudioData(await r.arrayBuffer()); if (my === token.current) schedule(c, buf, "speaking", my, c.currentTime); return; }
    } catch (e) { if (e.name === "AbortError") return; }
    // 2. Adam, generated on this laptop, one sentence at a time so it starts quickly.
    try {
      const tts = await localVoice(my); if (my !== token.current) return;
      step(my, "Speaking");
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
    if (my !== token.current) return;
    // 3. The browser's own voice.
    if (!("speechSynthesis" in window)) return fail(my, "No voice is available on this laptop");
    step(my, "Speaking with the laptop's own voice"); sendRemote("status", "speaking");
    const u = new SpeechSynthesisUtterance(text);
    const vs = window.speechSynthesis.getVoices();
    u.voice = vs.find((v) => /en-(US|GB)/i.test(v.lang) && /male|daniel|aaron|alex|fred|george|arthur/i.test(v.name)) || vs.find((v) => /en-US/i.test(v.lang)) || null;
    u.rate = 1.03;
    u.onend = () => { if (my !== token.current) return; setSynthetic(false); setState("idle"); setJob(null); sendRemote("status", "done"); };
    u.onerror = u.onend;
    try { setSynthetic(true); setState("speaking"); window.speechSynthesis.speak(u); }
    catch (e) { console.warn("browser voice failed", e); fail(my, "The laptop's voice couldn't start"); }
  }, [ready, schedule, localVoice, step, fail, sendRemote]);

  // The worker. A question arrives, older work is dropped, each step shows on the stage, then the answer is spoken.
  const ask = useCallback(async (q) => {
    q = (q || "").trim(); if (!q) return;
    const my = cancel(); const ac = new AbortController(); abort.current = ac;
    setJob({ question: q, steps: [] }); setState("thinking"); sendRemote("status", "thinking");
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history: history.current }), signal: ac.signal });
      if (!r.ok || !r.body) throw new Error("bad response");
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "", answer = null;
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
          const ev = JSON.parse(line);
          if (my !== token.current) return;
          if (ev.type === "step") { step(my, ev.text); sendRemote("status", "thinking: " + ev.text); }
          else if (ev.type === "answer") answer = ev.text;
          else if (ev.type === "error") return fail(my, ev.text);
        }
      }
      if (my !== token.current) return;
      if (!answer) return fail(my, "No answer came back");
      history.current = [...history.current, { role: "user", content: q }, { role: "assistant", content: answer }].slice(-8);
      setLastAnswer(answer); await speakText(answer, my);
    } catch (e) { if (e.name !== "AbortError") { console.warn("ask failed", e); fail(my, "Couldn't reach the machine"); } }
  }, [cancel, speakText, step, fail, sendRemote]);

  // Phone: note where the queue is, send, then watch the laptop's status from that point.
  const watchLaptop = useCallback(async (since) => {
    const my = ++waiting.current; let last = since || 0;
    const until = Date.now() + 150000;
    while (my === waiting.current && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const j = await (await fetch(`/api/remote?after=${last}`)).json(); last = Math.max(last, j.last || 0);
        const st = (j.cmds || []).filter((c) => c.cmd === "status" && c.src !== id.current).pop();
        if (!st) continue;
        setRemoteStatus(st.text);
        if (st.text === "done" || st.text.startsWith("error")) { setState("idle"); if (st.text === "done") setRemoteStatus(""); return; }
        setState("sent");
      } catch {}
    }
    if (my === waiting.current) { setState("idle"); setRemoteStatus(""); }
  }, []);
  const remoteCommand = useCallback(async (cmd, text) => {
    let since = 0;
    try { since = (await (await fetch("/api/remote")).json()).last || 0; } catch {}
    await sendRemote(cmd, text);
    setRemoteStatus(""); setState("sent");
    watchLaptop(since);
  }, [sendRemote, watchLaptop]);

  // Listen. On the phone the words go to the laptop; on the laptop they're answered here.
  const listen = useCallback(() => {
    if (state === "speaking" || state === "briefing") return stop();
    if (state === "listening") return recRef.current?.stop();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    const remote = isRemote();
    if (!remote) ensureCtx();
    const r = new SR(); r.lang = "en-GB"; r.interimResults = false; r.maxAlternatives = 1;
    let text = "";
    r.onresult = (e) => { text = Array.from(e.results).map((x) => x[0].transcript).join(" "); };
    r.onerror = () => setState("idle");
    r.onend = () => {
      if (!text) return setState((s) => (s === "listening" ? "idle" : s));
      if (remote) remoteCommand("ask", text); else ask(text);
    };
    recRef.current = r; setState("listening"); r.start();
  }, [state, stop, ensureCtx, remoteCommand, ask]);

  // The laptop checks for commands from the phone. One stable loop; handlers are read through a ref.
  const handlers = useRef({});
  handlers.current = { playBriefing, ask, stop };
  useEffect(() => {
    if (isTouch) return;
    let last = null, timer, busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        if (last === null) { last = (await (await fetch("/api/remote")).json()).last || 0; busy = false; return; }
        const j = await (await fetch(`/api/remote?after=${last}`)).json();
        const cmds = (j.cmds || []).filter((c) => c.src !== id.current && c.cmd !== "status");
        last = Math.max(last, j.last || 0);
        const c = cmds[cmds.length - 1];
        if (c) {
          if (c.cmd === "stop") handlers.current.stop();
          else if (c.cmd === "play") handlers.current.playBriefing();
          else if (c.cmd === "ask" && c.text) handlers.current.ask(c.text);
        }
      } catch {}
      busy = false;
    };
    tick(); timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isTouch]);

  const unlock = useCallback(async () => {
    const c = ensureCtx(); await c.resume().catch(() => {});
    setNeedsUnlock(false);
    const p = pending.current; pending.current = null; if (p) p();
  }, [ensureCtx]);

  const progress = () => {
    const c = ctxRef.current; if (!c || state !== "briefing" || !durRef.current) return { t: 0, d: 0 };
    return { t: Math.min(durRef.current, c.currentTime - startRef.current), d: durRef.current };
  };

  const value = { state, synthetic, isTouch, needsUnlock, lastAnswer, remoteStatus, job, remoteCommand, briefing, analyser: analyserRef, playBriefing, speakText, ask, listen, stop, sendRemote, unlock, progress };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
