import asyncio
from datetime import datetime, timedelta
from supabase import create_client, Client
from app.config import settings

# Master client — only for resolving phone → tenant. Never reads transaction data.
_master: Client = create_client(
    settings.MASTER_SUPABASE_URL,
    settings.MASTER_SUPABASE_SERVICE_KEY,
)


# ── Tenant resolution (master DB) ─────────────────────────────────────────────

def _get_tenant_by_phone_sync(phone: str) -> dict | None:
    """
    Given a normalized phone number (digits only, no whatsapp:+ prefix),
    return { tenant_id, supabase_url, supabase_service_key } or None.
    Two-step lookup: whatsapp_numbers → tenants.
    """
    wa = (
        _master.table("tenant_whatsapp_numbers")
        .select("tenant_id")
        .eq("phone", phone)
        .eq("active", True)
        .limit(1)
        .execute()
    )
    if not wa.data:
        return None

    tenant_id = wa.data[0]["tenant_id"]

    t = (
        _master.table("tenants")
        .select("supabase_url, supabase_service_key")
        .eq("id", tenant_id)
        .eq("active", True)
        .single()
        .execute()
    )
    if not t.data:
        return None

    return {
        "tenant_id": tenant_id,
        "supabase_url": t.data["supabase_url"],
        "supabase_service_key": t.data["supabase_service_key"],
    }


def make_tenant_client(supabase_url: str, service_key: str) -> Client:
    return create_client(supabase_url, service_key)


async def get_tenant_by_phone(phone: str) -> dict | None:
    return await asyncio.to_thread(_get_tenant_by_phone_sync, phone)


# ── Per-tenant DB operations — all accept the tenant's Client ─────────────────

def _get_or_create_user_sync(client: Client, phone: str) -> dict:
    result = client.table("users").select("*").eq("phone", phone).execute()
    if result.data:
        return result.data[0]
    result = client.table("users").insert({"phone": phone}).execute()
    return result.data[0]


def _get_user_name_sync(client: Client, phone: str) -> str | None:
    result = client.table("users").select("name").eq("phone", phone).execute()
    if result.data and result.data[0].get("name"):
        return result.data[0]["name"]
    return None


def _set_user_name_sync(client: Client, phone: str, name: str) -> None:
    client.table("users").update({"name": name}).eq("phone", phone).execute()


def _is_duplicate_sync(client: Client, user_id: str, merchant: str, amount: float) -> bool:
    cutoff = (datetime.utcnow() - timedelta(minutes=5)).isoformat()
    result = (
        client.table("transactions")
        .select("id")
        .eq("user_id", user_id)
        .eq("merchant", merchant)
        .eq("amount", amount)
        .gte("created_at", cutoff)
        .execute()
    )
    return bool(result.data)


def _save_transaction_sync(client: Client, user_id: str, expense: dict, raw_input: str) -> dict:
    data = {
        "user_id": user_id,
        "merchant": expense.get("merchant"),
        "amount": float(expense.get("amount", 0)),
        "category": expense.get("category", "Other"),
        "subcategory": expense.get("subcategory", ""),
        "description": expense.get("description", ""),
        "expense_date": expense.get("date") or datetime.now().strftime("%Y-%m-%d"),
        "confidence": float(expense.get("confidence", 1.0)),
        "currency": expense.get("currency", "INR"),
        "raw_input": raw_input[:500] if raw_input else "",
    }
    result = client.table("transactions").insert(data).execute()
    return result.data[0]


def _get_monthly_summary_sync(client: Client, user_id: str) -> dict:
    now = datetime.now()
    result = (
        client.table("transactions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    transactions = [
        t for t in result.data
        if t.get("created_at", "")[:7] == now.strftime("%Y-%m")
    ]
    total = sum(float(t["amount"]) for t in transactions)
    categories: dict = {}
    for t in transactions:
        cat = t.get("category") or "Other"
        categories[cat] = categories.get(cat, 0) + float(t["amount"])

    return {
        "total": total,
        "count": len(transactions),
        "categories": dict(sorted(categories.items(), key=lambda x: x[1], reverse=True)),
        "transactions": transactions[:5],
    }


# ── Async wrappers ────────────────────────────────────────────────────────────

async def get_or_create_user(client: Client, phone: str) -> dict:
    return await asyncio.to_thread(_get_or_create_user_sync, client, phone)


async def save_transaction(client: Client, user_id: str, expense: dict, raw_input: str) -> dict:
    return await asyncio.to_thread(_save_transaction_sync, client, user_id, expense, raw_input)


async def get_monthly_summary(client: Client, user_id: str) -> dict:
    return await asyncio.to_thread(_get_monthly_summary_sync, client, user_id)


async def is_duplicate(client: Client, user_id: str, merchant: str, amount: float) -> bool:
    return await asyncio.to_thread(_is_duplicate_sync, client, user_id, merchant, amount)


async def get_user_name(client: Client, phone: str) -> str | None:
    return await asyncio.to_thread(_get_user_name_sync, client, phone)


async def set_user_name(client: Client, phone: str, name: str) -> None:
    await asyncio.to_thread(_set_user_name_sync, client, phone, name)
