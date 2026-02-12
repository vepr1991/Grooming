from pydantic_settings import BaseSettings

class Settings(BaseSettings):

    SUPABASE_URL: str
    SUPABASE_KEY: str
    BOT_TOKEN: str
    ADMIN_CHAT_ID: int

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()