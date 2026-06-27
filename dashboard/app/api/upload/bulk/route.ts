import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/tenant-supabase";

export const dynamic = "force-dynamic";

const WEB_PHONE = "web_upload";

export async function POST(req: NextRequest) {
  const supabase = getTenantClient(req);
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transactions, uploadedBy } = await req.json() as {
    transactions: {
      merchant: string; amount: number; category: string;
      date: string; description: string; receipt_url?: string | null;
    }[];
    uploadedBy: string | null;
  };

  if (!Array.isArray(transactions) || !transactions.length) {
    return NextResponse.json({ error: "No transactions provided" }, { status: 400 });
  }

  // Ensure web_upload user exists
  let userId: string;
  const { data: existing } = await supabase.from("users").select("id").eq("phone", WEB_PHONE).maybeSingle();
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabase.from("users").insert({ phone: WEB_PHONE }).select("id").single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    userId = created.id;
  }

  const rows = transactions.map(t => ({
    user_id:      userId,
    merchant:     t.merchant.trim() || "Unknown",
    amount:       Number(t.amount),
    category:     t.category || "Other",
    description:  t.description || "",
    expense_date: t.date,
    currency:     "INR",
    raw_input:    "[bulk_import]",
    receipt_url:  t.receipt_url || null,
    metadata:     { uploaded_by: uploadedBy || null, source: t.receipt_url ? "multi_upload" : "excel" },
  }));

  const { data, error } = await supabase.from("transactions").insert(rows).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ imported: data?.length ?? 0 });
}
