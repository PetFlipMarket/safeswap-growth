export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Voices the machine's spoken answers with the same "Adam" voice as the briefing.
// ElevenLabs if a key is set (the real Adam), otherwise Kokoro's Adam via DeepInfra, otherwise 404
// and the phone falls back to its own voice.
export async function POST(req) {
  const { text } = await req.json();
  if (!text) return new Response("No text", { status: 400 });

  if (process.env.ELEVENLABS_API_KEY) {
    const vid = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.8 } }),
    });
    if (r.ok) return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  }

  if (process.env.DEEPINFRA_API_KEY) {
    const r = await fetch("https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M", {
      method: "POST",
      headers: { Authorization: `bearer ${process.env.DEEPINFRA_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ text, preset_voice: ["am_adam"], output_format: "mp3", speed: 1.08 }),
    });
    if (r.ok) {
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("audio")) return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
      const j = await r.json();
      const m = /^data:(audio\/[a-z0-9.+-]+);base64,(.+)$/i.exec(j.audio || "");
      if (m) return new Response(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "no-store" } });
    }
  }
  return new Response("No server voice configured", { status: 404 });
}
