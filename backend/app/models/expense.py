from pydantic import BaseModel
from typing import Optional


class ExpenseExtraction(BaseModel):
    is_expense: bool = True
    merchant: Optional[str] = "Unknown"
    amount: Optional[float] = 0.0
    category: Optional[str] = "Other"
    subcategory: Optional[str] = ""
    date: Optional[str] = None
    description: Optional[str] = ""
    confidence: Optional[float] = 1.0
    currency: Optional[str] = "INR"
