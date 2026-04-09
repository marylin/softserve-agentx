"""Local development server -- uses SQLite and loads .env for API keys."""
import os
import sys
import sqlite3

# Local dev defaults
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./local_test.db"
os.environ.setdefault("UPLOAD_DIR", "./uploads")
os.environ.setdefault("MEDUSA_REPO_PATH", "./medusa-subset")
os.environ.setdefault("KNOWLEDGE_BASE_PATH", "./knowledge-base")

sys.path.insert(0, ".")
from dotenv import load_dotenv
load_dotenv("../.env")

# Create SQLite tables using sync sqlite3 (avoids async/greenlet issues on Windows)
DB_PATH = "./local_test.db"
print(f"Seeding SQLite database: {DB_PATH}")
conn = sqlite3.connect(DB_PATH)
conn.executescript("""
    CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
        status TEXT NOT NULL DEFAULT 'received',
        reporter_email TEXT NOT NULL,
        reporter_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS incident_attachments (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
        incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS triage_results (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
        incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        severity TEXT NOT NULL,
        confidence REAL NOT NULL,
        summary TEXT NOT NULL,
        affected_modules TEXT NOT NULL DEFAULT '[]',
        code_references TEXT NOT NULL DEFAULT '[]',
        runbook_steps TEXT NOT NULL DEFAULT '[]',
        duplicate_of TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS routing_results (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
        incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        linear_ticket_id TEXT,
        linear_ticket_url TEXT,
        slack_message_ts TEXT,
        email_sent INTEGER NOT NULL DEFAULT 0,
        resolved_at TEXT,
        resolution_notified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
""")
conn.close()
print("Database seeded. Starting server...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="127.0.0.1", port=8000, reload=False)
