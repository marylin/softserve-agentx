import json
import time

import anthropic
from anthropic import Anthropic

from src.config import settings
from src.observability.langfuse_client import log_generation
from src.observability.logging import get_logger
from src.security.guardrails import ToolCallCounter

log = get_logger("agents.base")


def _create_client() -> tuple[Anthropic, str]:
    """Return (client, model) based on configured provider."""
    if settings.llm_provider == "openrouter":
        client = Anthropic(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key,
        )
        model = settings.openrouter_model
    else:
        client = Anthropic(api_key=settings.anthropic_api_key)
        model = settings.llm_model
    return client, model


def run_agent(
    name: str,
    system_prompt: str,
    user_message: str | list,
    tools: list | None = None,
    tool_handlers: dict | None = None,
    trace_span=None,
    max_tool_calls: int = 20,
) -> str:
    """Run a single agent turn with optional tool use.

    Retries on transient API errors with exponential backoff.
    Returns the final text response.
    """
    client, model = _create_client()
    counter = ToolCallCounter(max_calls=max_tool_calls)

    messages = [{"role": "user", "content": user_message}]
    api_tools = tools or []

    max_retries = 3
    backoff_times = [1, 2, 4]
    max_iterations = 30
    iteration = 0
    text_parts = []

    while iteration < max_iterations:
        iteration += 1
        # --- API call with retry ---
        response = None
        for attempt in range(max_retries):
            try:
                kwargs = {
                    "model": model,
                    "max_tokens": 4096,
                    "system": system_prompt,
                    "messages": messages,
                }
                if api_tools:
                    kwargs["tools"] = api_tools

                response = client.messages.create(**kwargs)
                break
            except (
                anthropic.RateLimitError,
                anthropic.APITimeoutError,
                anthropic.APIConnectionError,
            ) as exc:
                if attempt < max_retries - 1:
                    wait = backoff_times[attempt]
                    log.warning(
                        "api_retry",
                        agent=name,
                        attempt=attempt + 1,
                        error=str(exc),
                        wait=wait,
                    )
                    time.sleep(wait)
                else:
                    log.error("api_failed", agent=name, error=str(exc))
                    raise

        if response is None:
            raise RuntimeError(f"Agent {name}: no response after retries")

        # --- Log generation to Langfuse ---
        if trace_span:
            try:
                input_text = json.dumps(messages[-1]["content"])[:2000] if messages else ""
                output_blocks = [
                    b.text for b in response.content if hasattr(b, "text")
                ]
                output_text = "\n".join(output_blocks)[:2000]
                usage = {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                }
                log_generation(trace_span, model, input_text, output_text, usage)
            except Exception:
                pass  # observability should never break the pipeline

        # --- Collect text and tool_use blocks ---
        text_parts = []
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(block)

        # --- If no tool calls or stop_reason is end_turn, return text ---
        if response.stop_reason == "end_turn" or not tool_calls:
            final_text = "\n".join(text_parts)
            log.info("agent_complete", agent=name, tokens_in=response.usage.input_tokens, tokens_out=response.usage.output_tokens)
            return final_text

        # --- Handle tool calls ---
        tool_results = []
        for tc in tool_calls:
            if not counter.increment():
                log.warning("tool_call_limit", agent=name, limit=max_tool_calls)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": json.dumps(
                            {"error": f"Tool call limit ({max_tool_calls}) exceeded"}
                        ),
                        "is_error": True,
                    }
                )
                continue

            handler = (tool_handlers or {}).get(tc.name)
            if handler is None:
                log.warning("unknown_tool", agent=name, tool=tc.name)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": json.dumps({"error": f"Unknown tool: {tc.name}"}),
                        "is_error": True,
                    }
                )
                continue

            log.info("tool_call", agent=name, tool=tc.name, input_keys=list(tc.input.keys()))
            try:
                result = handler(**tc.input)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": result if isinstance(result, str) else json.dumps(result),
                    }
                )
            except Exception as exc:
                log.error("tool_error", agent=name, tool=tc.name, error=str(exc))
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": json.dumps({"error": str(exc)}),
                        "is_error": True,
                    }
                )

        # Append assistant message + tool results and loop
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    # Exhausted max iterations -- return whatever text we have
    log.warning("agent_max_iterations", agent=name, iterations=max_iterations)
    return "\n".join(text_parts) if text_parts else '{"error": "Agent exceeded maximum iterations"}'
