import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getTenantClient } from "@/lib/tenant-supabase";

export const dynamic = "force-dynamic";

const COL_ALIASES: Record<string, string[]> = {
  date:        ["date", "expense date", "bill date", "invoice date", "transaction date", "txn date", "dated", "voucher date"],
  merchant:    ["merchant", "vendor", "vendor name", "payee", "party", "party name", "particulars", "narration", "description", "name", "supplier"],
  amount:      ["amount", "total", "debit", "debit amount", "net amount", "invoice amount", "value", "cost", "paid", "expense amount", "total amount"],
  category:    ["category", "type", "expense type", "head", "account head", "ledger"],
  description: ["notes", "remarks", "details", "note", "comment", "memo"],
};

function detectCol(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (aliases.some(a => h === a || h.includes(a))) return i;
  }
  return -1;
}

function parseDate(val: unknown): string {
  const fallback = new Date().toISOString().slice(0, 10);
  if (!val) return fallback;
  if (val instanceof Date) return isNaN(val.getTime()) ? fallback : val.toISOString().slice(0, 10);
  // Excel serial number (number)
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const str = String(val).trim();
  // try common Indian formats: DD/MM/YYYY, DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const supabase = getTenantClient(req);
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch {
    return NextResponse.json({ error: "Could not read the file. Make sure it is a valid .xlsx or .csv file." }, { status: 422 });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  if (!rows || rows.length < 2) {
    return NextResponse.json({ error: "File is empty or has only headers and no data rows." }, { status: 422 });
  }

  const headers = (rows[0] as unknown[]).map(h => String(h ?? "").trim());

  const cols = {
    date:        detectCol(headers, COL_ALIASES.date),
    merchant:    detectCol(headers, COL_ALIASES.merchant),
    amount:      detectCol(headers, COL_ALIASES.amount),
    category:    detectCol(headers, COL_ALIASES.category),
    description: detectCol(headers, COL_ALIASES.description),
  };

  if (cols.amount === -1) {
    return NextResponse.json({
      error: `Could not find an Amount column. Found columns: ${headers.join(", ")}. Rename one column to "Amount" or "Total".`,
    }, { status: 422 });
  }

  const transactions: { merchant: string; amount: number; category: string; date: string; description: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const rawAmount = String(row[cols.amount] ?? "").replace(/[₹,\s]/g, "");
    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount <= 0) continue; // skip empty / non-expense rows

    transactions.push({
      merchant:    cols.merchant    !== -1 ? String(row[cols.merchant]    ?? "").trim() || "Unknown" : "Unknown",
      amount,
      category:    cols.category    !== -1 ? String(row[cols.category]    ?? "").trim() || "Other"   : "Other",
      date:        parseDate(cols.date !== -1 ? row[cols.date] : null),
      description: cols.description !== -1 ? String(row[cols.description] ?? "").trim() : "",
    });
  }

  if (!transactions.length) {
    return NextResponse.json({ error: "No valid expense rows found. Make sure rows have a positive Amount value." }, { status: 422 });
  }

  return NextResponse.json({ transactions, detectedColumns: cols, totalRows: rows.length - 1 });
}
