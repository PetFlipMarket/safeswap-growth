"use client";
import { useEffect, useState } from "react";
import Mark from "./Mark";
import { useVoice } from "./Voice";

// The phone screen: one big button. Tap, ask; the laptop answers.
export default function VoicePhone({ hasAudio }) {
  const v = useVoice();
  const [canListen, setCanListen] = useState(true);
  useEffect(() => { setCanListen(!!(window.SpeechRecognition || window.webkitSpeechRecognition)); }, []);
  const s = v.state;
  const label = { idle: canListen ? "Tap and ask" : "Voice isn't supported in this browser", listening: "Listening", sent: "Sent to your laptop", thinking: "Thinking", loading: "Thinking", speaking: "Talking", briefing: "Talking" }[s] || "Tap and ask";
  return (
    <div className="vphone phone-only">
      <button type="button" className={`vbtn ${s}`} onClick={v.listen} disabled={!canListen} aria-label={label}>
        <Mark size={220} ring={false} />
        <span className="vring" aria-hidden="true" />
      </button>
      <div className="vlabel">{label}</div>
      <div className="vlinks">
        {hasAudio && <button type="button" onClick={() => v.sendRemote("play")}>Play today's briefing on my laptop</button>}
        <button type="button" onClick={() => v.sendRemote("stop")}>Stop my laptop</button>
        <a href="/growth">Stats</a>
      </div>
    </div>
  );
}
