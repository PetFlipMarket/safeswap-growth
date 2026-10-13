import { db } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db()`select audio from growth.briefings where audio is not null order by day desc limit 1`;
  if (!rows.length) return new Response("No briefing yet", { status: 404 });
  return new Response(rows[0].audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
