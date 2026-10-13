"use client";
import { useEffect, useState } from "react";
import Mark from "./Mark";
import { useVoice } from "./Voice";

// The phone screen: one big button. Tap, ask, listen.
export default function VoicePhone({ hasAudio }) {
  const v = useVoice();
  const [canListen, setCanListen] = useState(true);
  useEffect(() => { setCanListen(!!(window.SpeechRecognition || window.webkitSpeechRecognition)); }, []);
  const s = v.state;
  const label = { idle: canListen ? "Tap and ask" : "Voice isn't supported in this browser", listening: "Listening", thinking: "Thinking", speaking: "Talking", briefing: "Talking" }[s];
  return (
    <div className="vphone phone-only">
      <button type="button" className={`vbtn ${s}`} onClick={v.listen} disabled={!canListen || s === "thinking"} aria-label={label}>
        <Mark size={220} ring={false} />
        <span className="vring" aria-hidden="true" />
      </button>
      <div className="vlabel">{label}</div>
      <div className="vlinks">
        {hasAudio && <button type="button" onClick={v.playBriefing}>Play today's briefing</button>}
        {hasAudio && <button type="button" onClick={() => v.sendRemote("play")}>Play it on my laptop</button>}
        <a href="/growth">Stats</a>
      </div>
    </div>
  );
}
