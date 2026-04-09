import ssl

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.config import settings


def _build_engine():
    url = settings.database_url
    connect_args = {}

    # SQLite for local development (no connect_args needed)
    if url.startswith("sqlite"):
        return create_async_engine(
            url, echo=False,
            connect_args={"check_same_thread": False},
        )

    # asyncpg doesn't support sslmode query param -- convert to ssl context
    if "sslmode=" in url:
        url = url.split("?")[0]
        connect_args["ssl"] = ssl.create_default_context()
    elif "neon.tech" in url or "supabase" in url:
        connect_args["ssl"] = ssl.create_default_context()

    return create_async_engine(url, echo=False, connect_args=connect_args)


engine = _build_engine()
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
