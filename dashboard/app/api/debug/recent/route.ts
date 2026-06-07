import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, merchant, amount, expense_date, created_at, raw_input, receipt_url")
    .order("created_at", { ascending: false })
    .limit(10);
  return NextResponse.json({ data, error });
}
