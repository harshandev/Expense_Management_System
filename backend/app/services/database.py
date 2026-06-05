import asyncio
from datetime import datetime
from supabase import create_client, Client
from app.config import settings

# Sync Supabase client — wrapped in asyncio.to_thread for non-blocking calls
_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)


def _get_or_create_user_sync(phone: str) -> dict:
    result = _client.table("users").select("*").eq("phone", phone).execute()
    if result.data:
        return result.data[0]
    result = _client.table("users").insert({"phone": phone}).execute()
    return result.data[0]


def _get_user_name_sync(phone: str) -> str | None:
    """Return the stored display name for a phone number, or None if not set."""
    result = _client.table("users").select("name").eq("phone", phone).execute()
    if result.data and result.data[0].get("name"):
        return result.data[0]["name"]
    return None


def _set_user_name_sync(phone: str, name: str) -> None:
    """Persist a display name for a user."""
    _client.table("users").update({"name": name}).eq("phone", phone).execute()


def _is_duplicate_sync(user_id: str, merchant: str, amount: float) -> bool:
    """
    Return True if the same merchant + amount was already saved for this user
    within the last 5 minutes — guards against double-sends from WhatsApp retries.
    """
    from datetime import timedelta
    cutoff = (datetime.utcnow() - timedelta(minutes=5)).isoformat()
    result = (
        _client.table("transactions")
        .select("id")
        .eq("user_id", user_id)
        .eq("merchant", merchant)
        .eq("amount", amount)
        .gte("created_at", cutoff)
        .execute()
    )
    return bool(result.data)


def _save_transaction_sync(user_id: str, expense: dict, raw_input: str) -> dict:
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
    result = _client.table("transactions").insert(data).execute()
    return result.data[0]


def _get_monthly_summary_sync(user_id: str) -> dict:
    now = datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Fetch all user transactions and filter in Python to avoid date format issues
    result = (
        _client.table("transactions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    # Filter to current month using created_at (always set by DB)
    all_rows = result.data
    transactions = []
    for t in all_rows:
        created = t.get("created_at", "")
        if created and created[:7] == now.strftime("%Y-%m"):
            transactions.append(t)

    total = sum(float(t["amount"]) for t in transactions)

    categories: dict = {}
    for t in transactions:
        cat = t.get("category") or "Other"
        categories[cat] = categories.get(cat, 0) + float(t["amount"])

    return {
        "total": total,
        "count": len(transactions),
        "categories": dict(sorted(categories.items(), key=lambda x: x[1], reverse=True)),
        "transactions": transactions[:5],  # latest 5
    }


# Async wrappers — FastAPI stays non-blocking
async def get_or_create_user(phone: str) -> dict:
    return await asyncio.to_thread(_get_or_create_user_sync, phone)


async def save_transaction(user_id: str, expense: dict, raw_input: str) -> dict:
    return await asyncio.to_thread(_save_transaction_sync, user_id, expense, raw_input)


async def get_monthly_summary(user_id: str) -> dict:
    return await asyncio.to_thread(_get_monthly_summary_sync, user_id)


async def is_duplicate(user_id: str, merchant: str, amount: float) -> bool:
    return await asyncio.to_thread(_is_duplicate_sync, user_id, merchant, amount)


async def get_user_name(phone: str) -> str | None:
    return await asyncio.to_thread(_get_user_name_sync, phone)


async def set_user_name(phone: str, name: str) -> None:
    await asyncio.to_thread(_set_user_name_sync, phone, name)
