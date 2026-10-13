import { db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A tiny command queue: the phone posts a command, the open laptop picks it up.
let ready = false;
const mem = [];

async function ensure() {
  if (ready || process.env.PREVIEW_FIXTURE) return;
  await db()`create table if not exists growth.remote (id bigserial primary key, cmd text not null, src text, created_at timestamptz not null default now())`;
  await db()`alter table growth.remote add column if not exists text text`;
  ready = true;
}

export async function POST(req) {
  const { cmd, src, text } = await req.json();
  if (!["play", "pause", "stop", "ask", "status"].includes(cmd)) return Response.json({ ok: false }, { status: 400 });
  const t = String(text || "").slice(0, 500);
  if (process.env.PREVIEW_FIXTURE) { mem.push({ id: mem.length + 1, cmd, src, text: t, at: Date.now() }); return Response.json({ ok: true }); }
  await ensure();
  await db()`insert into growth.remote (cmd, src, text) values (${cmd}, ${src || ""}, ${t})`;
  return Response.json({ ok: true });
}

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const hasAfter = p.has("after");
  const after = Number(p.get("after") || 0);
  if (process.env.PREVIEW_FIXTURE) {
    const lastStatus = mem.filter((c) => c.cmd === "status").pop();
    return Response.json({ cmds: hasAfter ? mem.filter((c) => c.id > after) : [], last: mem.length, laptop: lastStatus ? Math.round((Date.now() - lastStatus.at) / 1000) : null });
  }
  await ensure();
  const rows = hasAfter
    ? await db()`select id, cmd, src, text from growth.remote where id > ${after} and created_at > now() - interval '30 seconds' order by id`
    : [];
  const [{ m, laptop }] = await db()`select coalesce(max(id), 0)::int m, extract(epoch from now() - max(created_at) filter (where cmd = 'status'))::int laptop from growth.remote`;
  return Response.json({ cmds: rows, last: m, laptop });
}
