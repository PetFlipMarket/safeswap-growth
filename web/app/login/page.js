export default async function Login({ searchParams }) {
  const sp = await searchParams;
  return (
    <main className="login">
      <form method="post" action="/api/login" className="panel">
        <img src="/robot.jpg" alt="" />
        <h1>Growth OS</h1>
        <p>SafeSwap's acquisition machine. Founder access only.</p>
        <label htmlFor="pw" className="sr">Password</label>
        <input id="pw" name="password" type="password" placeholder="Password" autoFocus required />
        {sp?.e && <div className="err">That password isn't right.</div>}
        <button type="submit">Enter</button>
      </form>
    </main>
  );
}
