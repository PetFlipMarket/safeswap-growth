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
  const rs = v.remoteStatus;
  const online = v.laptopSeen != null && v.laptopSeen < 40;
  const remoteLabel = { thinking: "Laptop is working", loading: "Laptop is getting the voice ready (first time only)", speaking: "Laptop is talking", briefing: "Laptop is playing the briefing" }[rs]
    || (rs === "nolaptop" ? "Your laptop hasn't picked it up. Is the site open there?" : rs?.startsWith("thinking:") ? "Laptop: " + rs.slice(9).trim() : rs?.startsWith("error") ? rs.replace(/^error:\s*/, "Laptop says: ") : "Sent to your laptop");
  const label = { idle: canListen ? "Tap and ask" : "Voice isn't supported in this browser", listening: "Listening", sent: remoteLabel }[s] || "Tap and ask";
  return (
    <div className="vphone phone-only">
      <button type="button" className={`vbtn ${s}`} onClick={v.listen} disabled={!canListen} aria-label={label}>
        <Mark size={220} ring={false} />
        <span className="vring" aria-hidden="true" />
      </button>
      <div className="vlabel">{label}</div>
      <div className={`vlink ${online ? "on" : "off"}`}>{online ? "Laptop is listening" : "Laptop isn't open. Open this site on your laptop."}</div>
      <div className="vlinks">
        {hasAudio && <button type="button" onClick={() => v.remoteCommand("play")}>Play today's briefing on my laptop</button>}
        <button type="button" onClick={() => v.sendRemote("stop")}>Stop my laptop</button>
        <a href="/growth">Stats</a>
        <span className="vver">v11</span>
      </div>
    </div>
  );
}
