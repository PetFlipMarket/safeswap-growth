export default async function Login({ searchParams }) {
  const sp = await searchParams;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 18 }}>
      <form method="post" action="/api/login" className="card" style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="brand"><div className="logo">S</div>Growth OS</div>
        <label htmlFor="pw" className="muted">Password</label>
        <input id="pw" name="password" type="password" autoFocus required
          style={{ height: 50, borderRadius: 12, border: "1px solid var(--line)", background: "#0F0E16", color: "var(--text)", padding: "0 14px", fontSize: 17 }} />
        {sp?.e && <div style={{ color: "var(--red)" }}>Wrong password</div>}
        <button type="submit" style={{ height: 50, borderRadius: 12, border: "none", background: "var(--purple)", color: "#fff", fontWeight: 800, fontSize: 17, cursor: "pointer" }}>Enter</button>
      </form>
    </main>
  );
}
