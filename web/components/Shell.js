"use client";
import { usePathname } from "next/navigation";
import Mark from "./Mark";
import Stage from "./Stage";
import { VoiceProvider, useVoice } from "./Voice";

const I = {
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>,
  growth: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>,
  machine: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="3" /><path d="M8 20h8M12 16v4M8 10h.01M12 10h.01M16 10h.01" /></svg>,
  content: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9l5 3-5 3z" /></svg>,
  creators: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-5-6.3" /></svg>,
};
const NAV = [
  { href: "/", name: "Today", icon: I.today },
  { href: "/growth", name: "Growth", icon: I.growth },
  { href: "/machine", name: "Machine", icon: I.machine },
  { href: "/content", name: "Content", icon: I.content, soon: true },
  { href: "/creators", name: "Creators", icon: I.creators, soon: true },
];

function LinkChip() {
  const v = useVoice();
  if (v.isTouch || v.state !== "idle") return null;
  return <div className="linkchip desk-only">Listening for your phone</div>;
}

function Unlock() {
  const v = useVoice();
  if (!v.needsUnlock) return null;
  return (
    <div className="unlock" role="dialog" aria-label="Turn sound on">
      <button type="button" onClick={v.unlock}><Mark size={56} />Turn sound on</button>
    </div>
  );
}

export default function Shell({ children, online, briefing, voiceHome = false }) {
  const path = usePathname();
  const on = (h) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <VoiceProvider briefing={briefing}>
      <div className={`shell ${voiceHome ? "voice-home" : ""}`}>
        <aside className="side" aria-label="Sections">
          <div className="brand"><Mark size={34} /><div>SafeSwap<small>Growth OS</small></div></div>
          <nav className="nav">
            {NAV.map((n) => n.soon
              ? <a key={n.href} aria-disabled="true" style={{ cursor: "default", opacity: .6 }}>{n.icon}{n.name}<span className="soon">soon</span></a>
              : <a key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}>{n.icon}{n.name}</a>)}
          </nav>
          <div className="foot">
            <span className="status"><i />{online ? "Machine online" : "Machine idle"}</span>
            <span>Reads SafeSwap data only. Never writes to the app.</span>
          </div>
        </aside>
        <main className="main">{children}</main>
        <nav className="tabbar" aria-label="Sections">
          {NAV.filter((n) => !n.soon).map((n) => (
            <a key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}>{n.icon}{n.name}</a>
          ))}
        </nav>
      </div>
      <Stage />
      <LinkChip />
      <Unlock />
    </VoiceProvider>
  );
}
