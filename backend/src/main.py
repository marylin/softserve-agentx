import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.incidents import router as incidents_router
from src.api.metrics import router as metrics_router
from src.api.webhooks import router as webhooks_router
from src.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.upload_dir, exist_ok=True)
    yield


app = FastAPI(
    title="AgentX SRE Triage",
    description="SRE Incident Intake & Triage Agent",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "https://ssagentx.up.railway.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(incidents_router, prefix="/incidents", tags=["incidents"])
app.include_router(metrics_router, prefix="/metrics", tags=["metrics"])
app.include_router(webhooks_router, prefix="/webhooks", tags=["webhooks"])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/debug/db")
async def debug_db():
    """Temporary diagnostic -- remove before submission."""
    from sqlalchemy import text
    from src.db.database import engine
    try:
        async with engine.connect() as conn:
            r = await conn.execute(text("SELECT 1"))
            return {"db": "ok", "result": r.scalar(), "url_prefix": settings.database_url[:40]}
    except Exception as e:
        return {"db": "error", "error": str(e), "type": type(e).__name__, "url_prefix": settings.database_url[:40]}
