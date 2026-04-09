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
    """Wraps Langfuse v4 tracing using start_as_current_observation context managers."""

    def __init__(self, client, name: str, metadata: dict):
        self._client = client
        self._name = name
        self._metadata = metadata
        self._root_span = None
        self._root_ctx = None

        # Start a root agent span that acts as our "trace"
        try:
            self._root_ctx = self._client.start_as_current_observation(
                name=name,
                as_type="agent",
                metadata=metadata,
            )
            self._root_span = self._root_ctx.__enter__()
            log.info("langfuse_trace_started", name=name)
        except Exception as e:
            log.warning("langfuse_trace_start_failed", error=str(e))

    def span(self, name: str, metadata: dict | None = None):
        return SpanWrapper(self._client, name, metadata or {})

    def event(self, name: str, metadata: dict | None = None):
        try:
            self._client.start_observation(
                name=name,
                as_type="tool",
                metadata=metadata or {},
            )
        except Exception:
            pass

    def update(self, **kwargs):
        # Close root span
        try:
            if self._root_ctx:
                self._root_ctx.__exit__(None, None, None)
        except Exception:
            pass
        # Flush to ensure data is sent
        try:
            self._client.flush()
        except Exception:
            pass


class SpanWrapper:
    """Wraps a Langfuse span using the context-based v4 API."""

    def __init__(self, client, name: str, metadata: dict):
        self._client = client
        self._name = name
        self._span = None
        self._ctx = None
        try:
            self._ctx = self._client.start_as_current_observation(
                name=name,
                as_type="span",
                metadata=metadata,
            )
            self._span = self._ctx.__enter__()
        except Exception as e:
            log.warning("langfuse_span_start_failed", name=name, error=str(e))

    def generation(self, name: str = "llm-call", model: str = "", input=None, output=None, usage=None, **kwargs):
        try:
            usage_details = None
            if usage and isinstance(usage, dict):
                usage_details = {
                    "input": usage.get("input", 0),
                    "output": usage.get("output", 0),
                }
            gen_ctx = self._client.start_as_current_observation(
                name=name,
                as_type="generation",
                model=model,
                input=str(input)[:2000] if input else None,
                output=str(output)[:2000] if output else None,
                usage_details=usage_details,
            )
            gen = gen_ctx.__enter__()
            gen_ctx.__exit__(None, None, None)
        except Exception as e:
            log.warning("langfuse_generation_failed", name=name, error=str(e))
        return self

    def event(self, name: str, metadata: dict | None = None):
        try:
            obs = self._client.start_observation(
                name=name,
                as_type="tool",
                metadata=metadata or {},
            )
        except Exception:
            pass

    def end(self):
        try:
            if self._ctx:
                self._ctx.__exit__(None, None, None)
        except Exception:
            pass


def create_trace(incident_id: str, name: str = "incident-pipeline"):
    client = _get_client()
    if isinstance(client, _NoOp):
        return _NoOp()

    try:
        return TraceWrapper(client, name, {"incident_id": incident_id})
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
