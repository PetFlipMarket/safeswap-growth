import { NextResponse } from "next/server";
import { tokenFor } from "./lib/auth";

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/login")) return NextResponse.next();
  const want = await tokenFor(process.env.COMMAND_CENTRE_PASSWORD || "");
  if (req.cookies.get("cc")?.value === want && process.env.COMMAND_CENTRE_PASSWORD) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg)$).*)"] };
