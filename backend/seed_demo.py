"""
EMSI Demo Data Seeder — 90 days of realistic Indian expense data
Run: python3 seed_demo.py
"""
import os, uuid, random
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SECRET_KEY"))

USER_ID = "c8f0e0d2-4b81-4158-8e44-b3b0b7c760cb"

# ── Merchant templates per category ──────────────────────────────────────────
MERCHANTS = {
    "Food": [
        ("Swiggy",       "Food Delivery",    200, 650),
        ("Zomato",       "Food Delivery",    180, 700),
        ("Blinkit",      "Grocery",          300, 900),
        ("Zepto",        "Grocery",          250, 800),
        ("BigBasket",    "Grocery",          800, 2500),
        ("Starbucks",    "Cafe",             280, 480),
        ("Cafe Coffee Day","Cafe",           150, 350),
        ("Domino's",     "Fast Food",        250, 600),
        ("McDonald's",   "Fast Food",        200, 450),
        ("Saravana Bhavan","Restaurant",     300, 800),
    ],
    "Transport": [
        ("Uber",         "Ride-hailing",     80,  400),
        ("Ola",          "Ride-hailing",     70,  350),
        ("BMTC",         "Bus",              15,   50),
        ("Namma Metro",  "Metro",            30,   80),
        ("Indian Oil",   "Petrol",           500, 2000),
        ("HP Petrol Pump","Petrol",          500, 2000),
        ("Rapido",       "Bike Taxi",        40,  150),
    ],
    "Shopping": [
        ("Amazon",       "Online Shopping",  300, 3500),
        ("Flipkart",     "Online Shopping",  400, 2500),
        ("Myntra",       "Clothing",         600, 2500),
        ("H&M",          "Clothing",         800, 3000),
        ("DMart",        "Supermarket",      500, 2000),
        ("Reliance Fresh","Supermarket",     300, 1200),
        ("Nykaa",        "Personal Care",    400, 1500),
        ("Croma",        "Electronics",      500, 8000),
    ],
    "Entertainment": [
        ("Netflix",      "Streaming",        199, 649),
        ("Spotify",      "Music",             59, 119),
        ("Hotstar",      "Streaming",        299, 299),
        ("Amazon Prime", "Streaming",        179, 179),
        ("PVR Cinemas",  "Movies",           250, 600),
        ("INOX",         "Movies",           200, 550),
        ("BookMyShow",   "Events",           300, 1200),
        ("PlayStation",  "Gaming",           499, 1299),
    ],
    "Health": [
        ("Apollo Pharmacy","Medicine",       150, 800),
        ("MedPlus",      "Medicine",         100, 600),
        ("Cult.fit",     "Gym",              700, 2000),
        ("Practo",       "Doctor Consult",   300, 800),
        ("Lenskart",     "Eyewear",          800, 3000),
        ("HealthifyMe",  "Fitness App",      299, 799),
    ],
    "Utilities": [
        ("BESCOM",       "Electricity",      600, 2500),
        ("Jio Fiber",    "Internet",         699, 999),
        ("Airtel",       "Mobile Recharge",  299, 599),
        ("Vi",           "Mobile Recharge",  199, 399),
        ("Piped Gas",    "Gas Bill",         300, 700),
        ("Housing Society","Maintenance",    500, 2000),
    ],
    "Education": [
        ("Udemy",        "Online Course",    299, 1499),
        ("Coursera",     "Online Course",    500, 1999),
        ("Notion",       "Productivity",     165, 450),
        ("Medium",       "Reading",          350, 350),
        ("Kindle",       "Books",            150, 500),
    ],
    "Investment": [
        ("Zerodha",      "Stocks",           2000, 15000),
        ("Groww",        "Mutual Fund",      1000, 10000),
        ("Coin by Zerodha","SIP",            2000, 5000),
        ("NPS",          "Pension",          1000, 3000),
        ("ET Money",     "Mutual Fund",      1500, 8000),
    ],
}

# ── Frequency weights: how many times per week each category appears ──────────
WEEKLY_FREQ = {
    "Food":          5,   # almost daily
    "Transport":     4,
    "Shopping":      2,
    "Entertainment": 1,
    "Health":        0.5,
    "Utilities":     0.3,
    "Education":     0.4,
    "Investment":    0.5,
}

def make_transaction(dt: datetime, category: str):
    merchant, subcategory, lo, hi = random.choice(MERCHANTS[category])
    amount = round(random.uniform(lo, hi), -1)  # round to nearest 10
    return {
        "id":          str(uuid.uuid4()),
        "user_id":     USER_ID,
        "merchant":    merchant,
        "amount":      float(amount),
        "category":    category,
        "subcategory": subcategory,
        "description": f"{subcategory} — {merchant}",
        "expense_date": dt.strftime("%Y-%m-%d"),
        "confidence":  round(random.uniform(0.88, 0.99), 2),
        "currency":    "INR",
        "raw_input":   f"Demo: {merchant} ₹{amount}",
        "created_at":  dt.isoformat(),
    }

def generate_transactions():
    """Generate 90 days of realistic, slightly randomised spending."""
    today = datetime(2026, 5, 28, tzinfo=timezone.utc)
    start = today - timedelta(days=89)          # ~3 months back
    txns  = []

    # ── Monthly recurring (utilities, subscriptions, investments) ───────────
    for month_offset in range(3):        # March, April, May
        month_start = datetime(2026, 3 + month_offset, 1, tzinfo=timezone.utc)

        # Electricity bill — 3rd of each month
        dt = month_start.replace(day=3) + timedelta(hours=random.randint(9, 18))
        txns.append(make_transaction(dt, "Utilities"))

        # Internet bill — 5th
        dt = month_start.replace(day=5) + timedelta(hours=random.randint(10, 15))
        m, s, lo, hi = ("Jio Fiber", "Internet", 699, 999)
        amount = random.choice([699, 799, 999])
        txns.append({**make_transaction(dt, "Utilities"),
                     "merchant": "Jio Fiber", "subcategory": "Internet",
                     "amount": float(amount)})

        # Mobile recharge — 10th
        dt = month_start.replace(day=10) + timedelta(hours=random.randint(8, 12))
        txns.append({**make_transaction(dt, "Utilities"),
                     "merchant": "Airtel", "subcategory": "Mobile Recharge",
                     "amount": float(random.choice([299, 399, 499]))})

        # Netflix — 15th
        dt = month_start.replace(day=15) + timedelta(hours=19)
        txns.append({**make_transaction(dt, "Entertainment"),
                     "merchant": "Netflix", "subcategory": "Streaming",
                     "amount": 649.0})

        # Spotify — 15th
        dt = month_start.replace(day=15) + timedelta(hours=20)
        txns.append({**make_transaction(dt, "Entertainment"),
                     "merchant": "Spotify", "subcategory": "Music",
                     "amount": 119.0})

        # SIP / Investment — 1st of month
        dt = month_start.replace(day=random.randint(1, 5)) + timedelta(hours=9)
        txns.append({**make_transaction(dt, "Investment"),
                     "merchant": "Groww", "subcategory": "Mutual Fund SIP",
                     "amount": float(random.choice([2000, 3000, 5000]))})

        # Gym — 2nd
        dt = month_start.replace(day=2) + timedelta(hours=7)
        txns.append({**make_transaction(dt, "Health"),
                     "merchant": "Cult.fit", "subcategory": "Gym Membership",
                     "amount": float(random.choice([1200, 1500, 1800]))})

    # ── Day-by-day random spending ───────────────────────────────────────────
    day = start
    while day <= today:
        for category, weekly in WEEKLY_FREQ.items():
            daily_prob = weekly / 7.0
            # Boost weekends for food/entertainment/shopping
            if day.weekday() >= 5:  # Sat/Sun
                if category in ("Food", "Entertainment", "Shopping"):
                    daily_prob *= 1.5
            if random.random() < daily_prob:
                hour  = random.randint(7, 22)
                minute = random.randint(0, 59)
                dt = day.replace(hour=hour, minute=minute, tzinfo=timezone.utc)
                txns.append(make_transaction(dt, category))
        day += timedelta(days=1)

    # Sort chronologically
    txns.sort(key=lambda x: x["created_at"])
    return txns

def clear_demo_data():
    """Remove previously seeded demo rows (raw_input starts with 'Demo:')."""
    res = client.table("transactions").delete().eq("user_id", USER_ID).like("raw_input", "Demo:%").execute()
    print(f"  Cleared {len(res.data)} old demo rows")

def seed():
    print("🌱 EMSI Demo Seeder starting…")
    clear_demo_data()

    txns = generate_transactions()
    print(f"  Generated {len(txns)} transactions across 90 days")

    # Batch insert in chunks of 50
    batch_size = 50
    inserted   = 0
    for i in range(0, len(txns), batch_size):
        batch = txns[i:i + batch_size]
        client.table("transactions").insert(batch).execute()
        inserted += len(batch)
        print(f"  Inserted {inserted}/{len(txns)}…")

    # Summary
    from collections import Counter
    cats = Counter(t["category"] for t in txns)
    totals = {}
    for t in txns:
        totals[t["category"]] = totals.get(t["category"], 0) + t["amount"]

    print("\n✅ Seed complete!")
    print(f"   Total transactions : {len(txns)}")
    print(f"   Date range         : {txns[0]['created_at'][:10]} → {txns[-1]['created_at'][:10]}")
    print("\n   By category:")
    for cat, cnt in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"     {cat:<15} {cnt:3d} txns   ₹{totals[cat]:,.0f}")

if __name__ == "__main__":
    seed()
