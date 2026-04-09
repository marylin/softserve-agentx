import json


def wrap_user_content(content: str) -> str:
    """Wrap user-supplied content in XML tags to delineate trust boundaries."""
    return f"<user_input>\n{content}\n</user_input>"


def validate_agent_output(
    output: str, expected_fields: list[str]
) -> tuple[bool, dict | None]:
    """Parse agent output as JSON and verify required fields exist.

    Returns (is_valid, parsed_dict | None).
    """
    try:
        parsed = json.loads(output)
    except (json.JSONDecodeError, TypeError):
        return False, None

    if not isinstance(parsed, dict):
        return False, None

    for field in expected_fields:
        if field not in parsed:
            return False, None

    return True, parsed


class ToolCallCounter:
    """Track and enforce a maximum number of tool calls per agent run."""

    def __init__(self, max_calls: int = 20):
        self.max_calls = max_calls
        self.count = 0

    def increment(self) -> bool:
        """Increment counter. Return True if within limit, False if exceeded."""
        self.count += 1
        return self.count <= self.max_calls

    def reset(self):
        self.count = 0
