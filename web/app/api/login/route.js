import { NextResponse } from "next/server";
import { tokenFor } from "../../../lib/auth";

export async function POST(req) {
  const form = await req.formData();
  const pw = String(form.get("password") || "");
  const ok = process.env.COMMAND_CENTRE_PASSWORD && pw === process.env.COMMAND_CENTRE_PASSWORD;
  const res = NextResponse.redirect(new URL(ok ? "/" : "/login?e=1", req.url), 303);
  if (ok) {
    res.cookies.set("cc", await tokenFor(pw), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90, path: "/" });
  }
  return res;
}
