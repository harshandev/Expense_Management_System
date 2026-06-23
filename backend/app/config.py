from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    TWILIO_ACCOUNT_SID: str
    TWILIO_AUTH_TOKEN: str
    TWILIO_WHATSAPP_NUMBER: str = "whatsapp:+14155238886"
    OPENAI_API_KEY: str
    # Master DB — used only for tenant lookup (phone → supabase creds)
    MASTER_SUPABASE_URL: str
    MASTER_SUPABASE_SERVICE_KEY: str

    class Config:
        env_file = ".env"


settings = Settings()
