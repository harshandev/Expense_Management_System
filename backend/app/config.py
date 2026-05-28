from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    TWILIO_ACCOUNT_SID: str
    TWILIO_AUTH_TOKEN: str
    TWILIO_WHATSAPP_NUMBER: str = "whatsapp:+14155238886"
    OPENAI_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_SECRET_KEY: str

    class Config:
        env_file = ".env"


settings = Settings()
