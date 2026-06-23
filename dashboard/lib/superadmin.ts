import { createHash } from "crypto";
import { NextRequest } from "next/server";

function cookieValue(): string {
  return createHash("sha256")
    .update("sa:" + (process.env.SUPERADMIN_PASSWORD ?? ""))
    .digest("hex");
}

export function makeSAToken(): string {
  return cookieValue();
}

export function isSAAuthenticated(req: NextRequest): boolean {
  const tok = req.cookies.get("sa_tok")?.value;
  return !!tok && tok === cookieValue();
}
