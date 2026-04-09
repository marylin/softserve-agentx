import json
import os
import subprocess

from src.config import settings
from src.observability.logging import get_logger
from src.security.validation import sanitize_path

log = get_logger("tools.codebase")


def _load_json(filename: str) -> list | dict:
    path = os.path.join(settings.knowledge_base_path, filename)
    if not os.path.exists(path):
        return []
    with open(path, "r") as f:
        return json.load(f)


def search_modules(query: str) -> str:
    """Search the module index for modules matching keyword query."""
    index = _load_json("index.json")
    if not isinstance(index, list):
        index = index.get("modules", []) if isinstance(index, dict) else []

    query_lower = query.lower()
    keywords = query_lower.split()

    scored = []
    for module in index:
        name = str(module.get("name", "")).lower()
        desc = str(module.get("description", "")).lower()
        text = f"{name} {desc}"
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scored.append((score, module))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = [item[1] for item in scored[:5]]
    return json.dumps(results, indent=2)


def read_module_docs(module_name: str) -> str:
    """Read documentation for a specific module."""
    safe_name = module_name.replace("/", "_").replace("\\", "_").replace("..", "")
    doc_path = os.path.join(settings.knowledge_base_path, "modules", f"{safe_name}.md")

    if not os.path.exists(doc_path):
        return json.dumps({"error": f"No documentation found for module: {module_name}"})

    with open(doc_path, "r") as f:
        content = f.read()

    return content[:5000]


def read_source_file(file_path: str) -> str:
    """Read a source file from the medusa repo, capped at 500 lines."""
    safe = sanitize_path(settings.medusa_repo_path, file_path)
    if safe is None:
        return json.dumps({"error": "Path traversal detected"})

    if not os.path.exists(safe):
        return json.dumps({"error": f"File not found: {file_path}"})

    with open(safe, "r", errors="replace") as f:
        lines = f.readlines()

    content = "".join(lines[:500])
    if len(lines) > 500:
        content += f"\n... truncated ({len(lines)} total lines)"

    return content


def search_codebase(query: str, file_pattern: str = "*.ts") -> str:
    """Search the medusa codebase using grep. Returns top 10 files with context."""
    repo = settings.medusa_repo_path
    if not os.path.isdir(repo):
        return json.dumps({"error": "Repository path not found"})

    try:
        result = subprocess.run(
            ["grep", "-r", "-n", "-i", "--include", file_pattern, "-l", query, repo],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return json.dumps({"error": "grep not available or timed out"})

    files = result.stdout.strip().split("\n")[:10]
    files = [f for f in files if f]

    output = []
    for fpath in files:
        try:
            res = subprocess.run(
                ["grep", "-n", "-i", "-C", "3", query, fpath],
                capture_output=True,
                text=True,
                timeout=5,
            )
            rel = os.path.relpath(fpath, repo)
            lines = res.stdout.strip().split("\n")[:15]
            output.append({"file": rel, "matches": lines})
        except Exception:
            continue

    return json.dumps(output, indent=2)


def get_api_route(method: str, path: str) -> str:
    """Look up an API route definition."""
    routes = _load_json("api-routes.json")
    if not isinstance(routes, list):
        routes = routes.get("routes", []) if isinstance(routes, dict) else []

    method_upper = method.upper()
    results = [
        r for r in routes
        if r.get("method", "").upper() == method_upper
        and path.lower() in r.get("path", "").lower()
    ]
    return json.dumps(results, indent=2) if results else json.dumps({"error": "No matching route found"})


def get_error_pattern(error_message: str) -> str:
    """Match an error message against known error patterns."""
    patterns = _load_json("error-patterns.json")
    if not isinstance(patterns, list):
        patterns = patterns.get("patterns", []) if isinstance(patterns, dict) else []

    keywords = error_message.lower().split()
    scored = []
    for pattern in patterns:
        text = json.dumps(pattern).lower()
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scored.append((score, pattern))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = [item[1] for item in scored[:3]]
    return json.dumps(results, indent=2) if results else json.dumps({"error": "No matching patterns found"})


# ---------- Anthropic tool definitions ----------

CODEBASE_TOOLS = [
    {
        "name": "search_modules",
        "description": "Search the module index for modules matching a keyword query. Returns top 5 matches.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keywords"}
            },
            "required": ["query"],
        },
    },
    {
        "name": "read_module_docs",
        "description": "Read documentation for a specific module by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "module_name": {"type": "string", "description": "Module name"}
            },
            "required": ["module_name"],
        },
    },
    {
        "name": "read_source_file",
        "description": "Read a source file from the repository (max 500 lines).",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Relative path within the repo"}
            },
            "required": ["file_path"],
        },
    },
    {
        "name": "search_codebase",
        "description": "Grep the codebase for a query string. Returns matching files with context.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search string"},
                "file_pattern": {"type": "string", "description": "Glob pattern for files (default: *.ts)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_api_route",
        "description": "Look up an API route by HTTP method and path.",
        "input_schema": {
            "type": "object",
            "properties": {
                "method": {"type": "string", "description": "HTTP method (GET, POST, etc.)"},
                "path": {"type": "string", "description": "URL path or partial path"},
            },
            "required": ["method", "path"],
        },
    },
    {
        "name": "get_error_pattern",
        "description": "Match an error message against known error patterns for diagnosis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "error_message": {"type": "string", "description": "Error message to look up"}
            },
            "required": ["error_message"],
        },
    },
]

CODEBASE_TOOL_HANDLERS = {
    "search_modules": lambda **kw: search_modules(kw["query"]),
    "read_module_docs": lambda **kw: read_module_docs(kw["module_name"]),
    "read_source_file": lambda **kw: read_source_file(kw["file_path"]),
    "search_codebase": lambda **kw: search_codebase(kw["query"], kw.get("file_pattern", "*.ts")),
    "get_api_route": lambda **kw: get_api_route(kw["method"], kw["path"]),
    "get_error_pattern": lambda **kw: get_error_pattern(kw["error_message"]),
}
