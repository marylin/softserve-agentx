from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://agentx:agentx@postgres:5432/agentx"

    llm_provider: str = "anthropic"
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-20250514"
    openrouter_api_key: str = ""
    openrouter_model: str = "anthropic/claude-sonnet-4"

    langfuse_enabled: bool = True
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    linear_api_key: str = ""
    linear_team_id: str = ""
    linear_webhook_secret: str = ""

    slack_webhook_critical: str = ""
    slack_webhook_general: str = ""

    resend_api_key: str = ""
    resend_from_email: str = "incidents@example.com"
    resend_team_email: str = "oncall@example.com"

    frontend_url: str = "http://localhost:5173"
    upload_dir: str = "/app/uploads"
    medusa_repo_path: str = "/app/medusa-subset"
    knowledge_base_path: str = "/app/knowledge-base"

    model_config = {"env_file": ".env"}


settings = Settings()
