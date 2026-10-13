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
  const [laptopSeen, setLaptopSeen] = useState(null); // seconds since the laptop last checked in (phone side)
  const ctxRef = useRef(null), analyserRef = useRef(null), queue = useRef([]), startRef = useRef(0), durRef = useRef(0);
  const token = useRef(0), kokoro = useRef(null), recRef = useRef(null), pending = useRef(null), history = useRef([]);
  const abort = useRef(null), waiting = useRef(0);
  const id = useRef(Math.random().toString(36).slice(2));

  // Phone = a touch-first device with no hover (iPhone/Android). Anything with a mouse or trackpad is the laptop,
  // whatever the window size. ?as=phone or ?as=laptop forces it.
  const isRemote = () => {
    const f = new URLSearchParams(window.location.search).get("as");
    if (f === "phone") return true; if (f === "laptop") return false;
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  };
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
    say.current = { ...say.current, q: [], running: false, open: false, at: 0, synth: false };
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

  // Everything spoken goes through one pipeline: sentences queue up, each is turned into audio
  // (server voice → Adam on this laptop → the browser's voice) and played gaplessly in order.
  const say = useRef({ q: [], running: false, open: false, at: 0, synth: false, server: null, local: true });

  const finishIfDone = useCallback((my) => {
    const p = say.current;
    if (my !== token.current || p.open || p.q.length || p.running || p.synth || queue.current.length) return;
    setState("idle"); setJob(null); sendRemote("status", "done");
  }, [sendRemote]);

  const schedule = useCallback((c, buffer, kind, my, at) => {
    const s = c.createBufferSource(); s.buffer = buffer; s.connect(analyserRef.current);
    const start = Math.max(at, c.currentTime + 0.02); s.start(start);
    if (queue.current.length === 0) sendRemote("status", kind === "briefing" ? "briefing" : "speaking");
    queue.current.push(s);
    s.onended = () => { queue.current = queue.current.filter((x) => x !== s); finishIfDone(my); };
    setSynthetic(false); setState(kind);
    return start + buffer.duration;
  }, [sendRemote, finishIfDone]);

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

  // Adam, generated on this laptop. Loaded once (quietly at page open, so it's ready before the first question).
  const loading = useRef(null);
  const localVoice = useCallback((my, quiet) => {
    if (kokoro.current) return Promise.resolve(kokoro.current);
    if (!quiet) { setState("loading"); step(my, "Getting Adam's voice ready (one-off download)"); sendRemote("status", "loading"); }
    if (!loading.current) loading.current = (async () => {
      const m = await import(/* webpackIgnore: true */ KOKORO_URL);
      const gpu = !!navigator.gpu; // WebGPU is many times faster than WASM for this model
      const tts = await m.KokoroTTS.from_pretrained(KOKORO_MODEL, {
        dtype: gpu ? "fp32" : "q8", device: gpu ? "webgpu" : "wasm",
        progress_callback: (p) => { if (p.status === "progress") setJob((j) => (j ? { ...j, pct: Math.round(p.progress || 0) } : j)); },
      });
      kokoro.current = tts; setJob((j) => (j ? { ...j, pct: undefined } : j));
      return tts;
    })().catch((e) => { loading.current = null; throw e; });
    return loading.current;
  }, [step, sendRemote]);

  // One sentence → an AudioBuffer, or null if only the browser's own voice is left.
  const makeAudio = useCallback(async (text, my, c) => {
    const p = say.current;
    if (p.server !== false) {
      try {
        const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: abort.current?.signal });
        if (r.ok) { p.server = true; return await c.decodeAudioData(await r.arrayBuffer()); }
        if (r.status === 404) p.server = false;
      } catch (e) { if (e.name === "AbortError") return null; }
    }
    if (p.local) {
      try {
        const tts = await localVoice(my); if (my !== token.current) return null;
        const a = await Promise.race([
          tts.generate(text, { voice: "am_adam", speed: 1.05 }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("local voice too slow")), 25000)),
        ]);
        const buf = c.createBuffer(1, a.audio.length, a.sampling_rate); buf.copyToChannel(a.audio, 0);
        return buf;
      } catch (e) { console.warn("local voice unavailable", e); p.local = false; }
    }
    return null;
  }, [localVoice]);

  const synthSay = useCallback((text, my) => new Promise((res) => {
    if (!("speechSynthesis" in window)) return res();
    const u = new SpeechSynthesisUtterance(text);
    const vs = window.speechSynthesis.getVoices();
    u.voice = vs.find((v) => /en-(US|GB)/i.test(v.lang) && /male|daniel|aaron|alex|fred|george|arthur/i.test(v.name)) || vs.find((v) => /en-US/i.test(v.lang)) || null;
    u.rate = 1.03; u.onend = u.onerror = () => res();
    try { setSynthetic(true); setState("speaking"); if (my === token.current) sendRemote("status", "speaking"); window.speechSynthesis.speak(u); } catch { res(); }
  }), [sendRemote]);

  const pump = useCallback(async (my, c) => {
    const p = say.current; if (p.running) return; p.running = true;
    try {
      while (p.q.length && my === token.current) {
        const text = p.q.shift();
        const buf = await makeAudio(text, my, c); if (my !== token.current) return;
        if (buf) { p.at = schedule(c, buf, "speaking", my, Math.max(p.at, c.currentTime)); }
        else { p.synth = true; await synthSay(text, my); p.synth = false; }
      }
    } finally { p.running = false; }
    finishIfDone(my);
  }, [makeAudio, schedule, synthSay, finishIfDone]);

  // Queue a line to be spoken. `my` is the job's token; if a newer job started, it's dropped.
  const speak = useCallback((text, my, c) => {
    if (my !== token.current || !text?.trim()) return;
    say.current.q.push(text.trim()); pump(my, c);
  }, [pump]);

  const speakText = useCallback(async (text) => {
    if (isRemote()) return;
    const c = await ready(() => speakText(text)); if (!c) return;
    const my = cancel(); say.current = { ...say.current, q: [], running: false, open: false, at: 0, synth: false };
    setJob({ question: "", steps: [] });
    speak(text, my, c);
  }, [ready, cancel, speak]);

  // The worker. A question arrives, older work is dropped, each step shows on the stage, and the answer is spoken
  // line by line as it's written.
  const ask = useCallback(async (q) => {
    q = (q || "").trim(); if (!q) return;
    const c = await ready(() => ask(q)); if (!c) return;
    const my = cancel(); const ac = new AbortController(); abort.current = ac;
    say.current = { ...say.current, q: [], running: false, open: true, at: 0, synth: false };
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
          else if (ev.type === "say") speak(ev.text, my, c);
          else if (ev.type === "answer") answer = ev.text;
          else if (ev.type === "error") { say.current.open = false; return fail(my, ev.text); }
        }
      }
      if (my !== token.current) return;
      say.current.open = false;
      if (!answer) return fail(my, "No answer came back");
      history.current = [...history.current, { role: "user", content: q }, { role: "assistant", content: answer }].slice(-8);
      setLastAnswer(answer); finishIfDone(my);
    } catch (e) { say.current.open = false; if (e.name !== "AbortError") { console.warn("ask failed", e); fail(my, "Couldn't reach the machine"); } }
  }, [ready, cancel, speak, step, fail, finishIfDone, sendRemote]);

  // Phone: note where the queue is, send, then watch the laptop's status from that point.
  const watchLaptop = useCallback(async (since) => {
    const my = ++waiting.current; let last = since || 0, seen = false;
    const t0 = Date.now(), until = t0 + 150000;
    while (my === waiting.current && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const j = await (await fetch(`/api/remote?after=${last}`)).json(); last = Math.max(last, j.last || 0);
        const st = (j.cmds || []).filter((c) => c.cmd === "status" && c.src !== id.current && c.text !== "online").pop();
        if (!st) { if (Date.now() - t0 > 8000 && !seen) setRemoteStatus("nolaptop"); continue; }
        seen = true; setRemoteStatus(st.text);
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
    if (isTouch) {
      // Phone: is the laptop listening? Ask every few seconds.
      const check = async () => { try { const j = await (await fetch("/api/remote")).json(); setLaptopSeen(j.laptop ?? null); } catch {} };
      check(); const t = setInterval(check, 6000);
      return () => clearInterval(t);
    }
    // Warm the voice up while nothing's happening, so the first answer doesn't wait for it.
    const warm = setTimeout(async () => {
      try { const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "hi" }) }); if (r.ok) { say.current.server = true; return; } } catch {}
      say.current.server = false; localVoice(-1, true).catch(() => {});
    }, 1500);
    let last = null, timer, busy = false, beat = 0;
    const tick = async () => {
      if (busy) return;
      busy = true;
      if (Date.now() - beat > 15000) { beat = Date.now(); sendRemote("status", "online"); }
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
    return () => { clearInterval(timer); clearTimeout(warm); };
  }, [isTouch, sendRemote, localVoice]);

  const unlock = useCallback(async () => {
    const c = ensureCtx(); await c.resume().catch(() => {});
    setNeedsUnlock(false);
    const p = pending.current; pending.current = null; if (p) p();
  }, [ensureCtx]);

  const progress = () => {
    const c = ctxRef.current; if (!c || state !== "briefing" || !durRef.current) return { t: 0, d: 0 };
    return { t: Math.min(durRef.current, c.currentTime - startRef.current), d: durRef.current };
  };

  const value = { state, synthetic, isTouch, needsUnlock, lastAnswer, remoteStatus, laptopSeen, job, remoteCommand, briefing, analyser: analyserRef, playBriefing, speakText, ask, listen, stop, sendRemote, unlock, progress };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
