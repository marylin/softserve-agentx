"""Clear all incident data from the database."""
import os, sys
sys.path.insert(0, ".")
from dotenv import load_dotenv
load_dotenv("../.env")
import psycopg
url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
conn = psycopg.connect(url, connect_timeout=10)
conn.autocommit = True
conn.execute("DELETE FROM routing_results")
conn.execute("DELETE FROM triage_results")
conn.execute("DELETE FROM incident_attachments")
conn.execute("DELETE FROM incidents")
cur = conn.execute("SELECT COUNT(*) FROM incidents")
print(f"Done. Incidents remaining: {cur.fetchone()[0]}")
conn.close()
