import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getSession } from "./session";

export function getTenantClient(req: NextRequest): SupabaseClient | null {
  const session = getSession(req);
  if (!session) return null;
  return createClient(session.supabase_url, session.supabase_anon_key);
}
