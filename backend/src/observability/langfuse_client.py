from src.config import settings
from src.observability.logging import get_logger

log = get_logger("observability.langfuse")


class _NoOp:
    """Stub that silently swallows every call when Langfuse is disabled."""

    def __call__(self, *a, **kw):
        return self

    def __getattr__(self, name):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def __bool__(self):
        return False


_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client

    if settings.langfuse_enabled and settings.langfuse_secret_key:
        try:
            from langfuse import Langfuse

            _client = Langfuse(
                secret_key=settings.langfuse_secret_key,
                public_key=settings.langfuse_public_key,
                host=settings.langfuse_host,
            )
            _client.auth_check()
            log.info("langfuse_initialized", host=settings.langfuse_host)
        except Exception as e:
            log.warning("langfuse_init_failed", error=str(e))
            _client = _NoOp()
    else:
        _client = _NoOp()
    return _client


class TraceWrapper:
    """Wraps a root Langfuse span and provides child span creation via explicit references."""

    def __init__(self, root_span):
        self._root = root_span

    def span(self, name: str, metadata: dict | None = None):
        """Create a child span under the root trace span."""
        try:
            child = self._root.start_observation(
                name=name,
                as_type="span",
                metadata=metadata or {},
            )
            return SpanWrapper(child)
        except Exception as e:
            log.warning("langfuse_span_failed", name=name, error=str(e))
            return _NoOp()

    def event(self, name: str, metadata: dict | None = None):
        try:
            self._root.start_observation(
                name=name,
                as_type="tool",
                metadata=metadata or {},
            )
        except Exception:
            pass

    def end(self):
        """End the root span and flush."""
        try:
            self._root.end()
        except Exception:
            pass
        try:
            _get_client().flush()
        except Exception:
            pass


class SpanWrapper:
    """Wraps a Langfuse span with child generation and event creation."""

    def __init__(self, span):
        self._span = span

    def generation(self, name: str = "llm-call", model: str = "", input=None, output=None, usage=None, **kwargs):
        try:
            usage_details = None
            if usage and isinstance(usage, dict):
                usage_details = {
                    "input": usage.get("input_tokens", usage.get("input", 0)),
                    "output": usage.get("output_tokens", usage.get("output", 0)),
                }
            gen = self._span.start_observation(
                name=name,
                as_type="generation",
                model=model,
                input=str(input)[:2000] if input else None,
                output=str(output)[:2000] if output else None,
                usage_details=usage_details,
            )
            gen.end()
        except Exception as e:
            log.warning("langfuse_generation_failed", name=name, error=str(e))
        return self

    def event(self, name: str, metadata: dict | None = None):
        try:
            self._span.start_observation(
                name=name,
                as_type="tool",
                metadata=metadata or {},
            )
        except Exception:
            pass

    def end(self):
        try:
            self._span.end()
        except Exception:
            pass


def create_trace(incident_id: str, name: str = "incident-pipeline"):
    """Create a root trace span for an incident pipeline."""
    client = _get_client()
    if isinstance(client, _NoOp):
        return _NoOp()

    try:
        root = client.start_observation(
            name=name,
            as_type="agent",
            metadata={"incident_id": incident_id},
        )
        log.info("langfuse_trace_created", incident_id=incident_id)
        return TraceWrapper(root)
    except Exception as e:
        log.warning("langfuse_create_trace_failed", error=str(e))
        return _NoOp()


def create_span(trace, name: str, metadata: dict | None = None):
    if isinstance(trace, _NoOp):
        return _NoOp()
    return trace.span(name=name, metadata=metadata)


def log_generation(span, model: str, input_text: str, output_text: str, usage: dict):
    if isinstance(span, _NoOp):
        return _NoOp()
    return span.generation(
        model=model,
        input=input_text,
        output=output_text,
        usage=usage,
    )
