import { NextRequest, NextResponse } from "next/server";
import { makeSAToken } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!process.env.SUPERADMIN_PASSWORD) {
    return NextResponse.json({ error: "SUPERADMIN_PASSWORD not configured" }, { status: 503 });
  }

  if (password !== process.env.SUPERADMIN_PASSWORD) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("sa_tok", makeSAToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8, // 8 hours
    sameSite: "strict",
    path: "/",
  });
  return res;
}
