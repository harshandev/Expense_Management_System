from fastapi import FastAPI
from app.routers import webhook

app = FastAPI(
    title="Expense Management System Intelligence API",
    description="AI-powered expense intelligence via WhatsApp",
    version="0.1.0",
)

app.include_router(webhook.router, prefix="/webhook", tags=["WhatsApp"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Expense Management System Intelligence", "version": "0.1.0"}
