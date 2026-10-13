import { db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A tiny command queue so your phone can tell your laptop to play.
let ready = false;
const mem = [];

async function ensure() {
  if (ready || process.env.PREVIEW_FIXTURE) return;
  await db()`create table if not exists growth.remote (id bigserial primary key, cmd text not null, src text, created_at timestamptz not null default now())`;
  ready = true;
}

export async function POST(req) {
  const { cmd, src } = await req.json();
  if (!["play", "pause", "stop"].includes(cmd)) return Response.json({ ok: false }, { status: 400 });
  if (process.env.PREVIEW_FIXTURE) { mem.push({ id: mem.length + 1, cmd, src, created_at: new Date() }); return Response.json({ ok: true }); }
  await ensure();
  await db()`insert into growth.remote (cmd, src) values (${cmd}, ${src || ""})`;
  return Response.json({ ok: true });
}

export async function GET(req) {
  const after = Number(new URL(req.url).searchParams.get("after") || 0);
  if (process.env.PREVIEW_FIXTURE) return Response.json({ cmds: mem.filter((c) => c.id > after), last: mem.length });
  await ensure();
  const rows = after
    ? await db()`select id, cmd, src from growth.remote where id > ${after} and created_at > now() - interval '30 seconds' order by id`
    : [];
  const [{ m }] = await db()`select coalesce(max(id), 0)::int m from growth.remote`;
  return Response.json({ cmds: after ? rows : [], last: m });
}
