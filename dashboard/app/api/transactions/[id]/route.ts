import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/tenant-supabase";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// PUT /api/transactions/[id] — update fields (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req);
  if (!session)                  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin")  return NextResponse.json({ error: "Forbidden"    }, { status: 403 });

  const supabase = getTenantClient(req)!;
  const { id }   = await params;

  const { merchant, amount, category, subcategory, description, expense_date } =
    await req.json() as {
      merchant: string; amount: number; category: string;
      subcategory: string; description: string; expense_date: string;
    };

  const { data, error } = await supabase
    .from("transactions")
    .update({ merchant: merchant.trim(), amount: Number(amount), category, subcategory, description, expense_date })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transaction: data });
}

// DELETE /api/transactions/[id] — remove transaction (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req);
  if (!session)                  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin")  return NextResponse.json({ error: "Forbidden"    }, { status: 403 });

  const supabase = getTenantClient(req)!;
  const { id }   = await params;

  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
