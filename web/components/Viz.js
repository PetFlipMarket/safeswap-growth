// Server-rendered visuals. No client JS.
const n = (v) => Number(v || 0);
export const fmt = (v) => n(v).toLocaleString("en-GB");
export const gbp = (v) => "£" + n(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function Delta({ now, prev, suffix = "" }) {
  if (!prev) return <span className="delta flat">no earlier data</span>;
  const p = Math.round(((now - prev) / prev) * 100);
  const cls = p > 0 ? "up" : p < 0 ? "down" : "flat";
  return (
    <span className={`delta ${cls} num`}>
      {p !== 0 && <svg viewBox="0 0 10 10" aria-hidden="true"><path d={p > 0 ? "M5 1l4 6H1z" : "M5 9L1 3h8z"} fill="currentColor" /></svg>}
      {p > 0 ? "+" : ""}{p}%{suffix}
    </span>
  );
}

export function Stat({ label, value, now, prev, series, color }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="v num">{value}</span>
      {now !== undefined && <Delta now={now} prev={prev} />}
      {series?.length > 1 && <Spark values={series} color={color} />}
    </div>
  );
}

export function Spark({ values, color = "#8B6CF0" }) {
  const mx = Math.max(...values), mn = Math.min(...values);
  const pts = values.map((v, i) => `${(i * 200) / (values.length - 1)},${34 - ((v - mn) / (mx - mn || 1)) * 30 + 2}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 200 36" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity=".9" />
    </svg>
  );
}

export function Area({ days, avg, label }) {
  const vals = days.map((d) => n(d.signups));
  if (vals.length < 2) return <div className="empty">Not enough days yet.</div>;
  const mx = Math.max(...vals, ...avg) * 1.08 || 1;
  const X = (i) => (i / (vals.length - 1)) * 100;
  const Y = (v) => 100 - (v / mx) * 100;
  const line = vals.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
  const area = `M0,100 L${line.replace(/ /g, " L")} L100,100 Z`;
  const avgLine = avg.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
  const last = vals.length - 1;
  const ticks = [0, 0.5, 1].map((f) => Math.round(mx * f));
  const d = (i) => new Date(days[i].day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div className="chart" role="img" aria-label={`${label}: ${fmt(vals[last])} on ${d(last)}, from ${fmt(vals[0])} on ${d(0)}`}>
      <div className="y num"><span>{fmt(ticks[2])}</span><span>{fmt(ticks[1])}</span><span>0</span></div>
      <div className="plot">
        <div className="gl" style={{ top: "0%" }} /><div className="gl" style={{ top: "50%" }} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8B6CF0" stopOpacity=".38" /><stop offset="1" stopColor="#8B6CF0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#fillg)" />
          <polyline points={avgLine} fill="none" stroke="#D9B04C" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity=".85" />
          <polyline points={line} fill="none" stroke="#8B6CF0" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="dot" style={{ left: `${X(last)}%`, top: `${Y(vals[last])}%` }} />
        <span className="tag num" style={{ left: `${X(last)}%`, top: `${Y(vals[last])}%` }}>{fmt(vals[last])}</span>
      </div>
      <div className="x"><span>{d(0)}</span><span>{d(Math.floor(last / 2))}</span><span>{d(last)}</span></div>
    </div>
  );
}

export function Ring({ frac, color = "#8B6CF0", size = 96, width = 10, track = "#242431", children }) {
  const r = (size - width) / 2, c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size, flexBasis: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={width} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
          strokeDasharray={`${Math.min(1, frac) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="num">{children}</span>
    </div>
  );
}

export function Bars({ rows, tone = "", empty = "Nothing here yet.", showShare = true, fmtV = fmt }) {
  if (!rows?.length) return <div className="empty">{empty}</div>;
  const total = rows.reduce((a, r) => a + n(r.value), 0);
  const mx = Math.max(...rows.map((r) => n(r.value)), 1);
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div className={`bar ${tone}`} key={i}>
          <span className="name" title={r.source}>{r.source}</span>
          <span className="val num">{fmtV(r.value)}{showShare && total > 0 && <small>{Math.round((n(r.value) / total) * 100)}%</small>}</span>
          <div className="track"><i style={{ width: `${Math.max(2, (n(r.value) / mx) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function Hours({ hours }) {
  const mx = Math.max(...hours, 1), peak = hours.indexOf(Math.max(...hours));
  return (
    <div className="hours-wrap">
      <div className="hours" role="img" aria-label={`Sign-ups by hour of day; busiest at ${peak}:00`}>
        {hours.map((c, h) => (
          <div key={h} className={h === peak ? "peak" : ""} title={`${h}:00, ${c} sign-ups`} style={{ height: `${Math.max(3, (c / mx) * 100)}%` }}>
            {h % 6 === 0 && <span className="num">{h}:00</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
