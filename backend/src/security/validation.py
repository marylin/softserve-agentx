import os
import re

INJECTION_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"ignore\s+(all\s+)?previous\s+instructions",
        r"ignore\s+(all\s+)?above\s+instructions",
        r"you\s+are\s+now\s+a",
        r"system\s*:\s*you",
        r"<\s*system\s*>",
        r"ADMIN\s*OVERRIDE",
        r"ACT\s+AS\s+",
        r"do\s+not\s+follow\s+any\s+previous",
        r"forget\s+(all\s+)?previous",
        r"new\s+instructions?\s*:",
    ]
]

MAX_TEXT_LENGTH = 10_000

ALLOWED_FILE_TYPES = {
    "image": {
        "content_types": {
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
        },
        "extensions": {".png", ".jpg", ".jpeg", ".webp", ".gif"},
        "max_size": 10 * 1024 * 1024,  # 10 MB
    },
    "log": {
        "content_types": {
            "text/plain",
            "application/octet-stream",
            "text/x-log",
        },
        "extensions": {".log", ".txt", ".out"},
        "max_size": 5 * 1024 * 1024,  # 5 MB
    },
    "video": {
        "content_types": {
            "video/mp4",
            "video/webm",
        },
        "extensions": {".mp4", ".webm"},
        "max_size": 50 * 1024 * 1024,  # 50 MB
    },
}


def check_prompt_injection(text: str) -> tuple[bool, str | None]:
    """Return (is_safe, matched_pattern). is_safe=True means no injection found."""
    for pattern in INJECTION_PATTERNS:
        if pattern.search(text):
            return False, pattern.pattern
    return True, None


def validate_text_input(text: str) -> tuple[bool, str | None]:
    """Return (is_valid, error). is_valid=True means input is acceptable."""
    if not text or not text.strip():
        return False, "Text input is empty"

    if len(text) > MAX_TEXT_LENGTH:
        return False, f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters"

    # Strip HTML tags
    cleaned = re.sub(r"<[^>]+>", "", text)
    if cleaned != text:
        # Text contained HTML -- still valid but we note it was cleaned
        pass

    is_safe, matched = check_prompt_injection(text)
    if not is_safe:
        return False, f"Potential prompt injection detected: {matched}"

    return True, None


def validate_file(
    filename: str, content_type: str, size: int
) -> tuple[bool, str | None]:
    """Return (is_valid, error)."""
    ext = os.path.splitext(filename)[1].lower() if filename else ""

    matched_category = None
    for category, rules in ALLOWED_FILE_TYPES.items():
        if content_type in rules["content_types"] or ext in rules["extensions"]:
            matched_category = category
            if size > rules["max_size"]:
                max_mb = rules["max_size"] // (1024 * 1024)
                return False, f"{category} file exceeds {max_mb}MB limit"
            return True, None

    if matched_category is None:
        return False, f"File type not allowed: {content_type} ({ext})"

    return True, None


def sanitize_path(base_dir: str, requested_path: str) -> str | None:
    """Resolve requested_path under base_dir. Return None if it escapes."""
    base = os.path.realpath(base_dir)
    full = os.path.realpath(os.path.join(base, requested_path))
    if not full.startswith(base + os.sep) and full != base:
        return None
    return full
