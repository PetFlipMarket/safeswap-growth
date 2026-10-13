import { RANGES } from "../lib/data";

export function when(t) {
  return t ? new Date(t).toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }) : "";
}
export function whenFull(t) {
  return t ? new Date(t).toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "";
}

export default function Header({ title, sub, range, base = "/", showRanges = true }) {
  return (
    <div className="phead">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {showRanges && (
        <nav className="ranges" aria-label="Period">
          {Object.entries(RANGES).map(([r, label]) => (
            <a key={r} href={`${base}?range=${r}`} className={Number(r) === range ? "on" : ""} aria-current={Number(r) === range ? "true" : undefined}>
              {label.replace("last ", "")}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
