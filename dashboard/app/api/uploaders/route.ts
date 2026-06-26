import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/tenant-supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getTenantClient(req);
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("transactions")
    .select("metadata, user_id");

  const names: string[] = [];
  const seen = new Set<string>();
  for (const t of data || []) {
    const name = (t.metadata as Record<string, unknown> | null)?.uploaded_by;
    if (typeof name === "string" && name.trim() && !seen.has(name.trim())) {
      seen.add(name.trim());
      names.push(name.trim());
    }
  }

  return NextResponse.json({ uploaders: names.sort() });
}
