from src.config import settings


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
        except Exception:
            _client = _NoOp()
    else:
        _client = _NoOp()
    return _client


class TraceWrapper:
    """Wraps Langfuse v4 tracing API into a simple span-based interface."""

    def __init__(self, client, trace_id: str, name: str, metadata: dict):
        self._client = client
        self.trace_id = trace_id
        self._name = name
        self._metadata = metadata

    def span(self, name: str, metadata: dict | None = None):
        return SpanWrapper(self._client, self.trace_id, name, metadata or {})

    def event(self, name: str, metadata: dict | None = None):
        try:
            self._client.create_event(
                trace_id=self.trace_id,
                name=name,
                metadata=metadata or {},
            )
        except Exception:
            pass

    def update(self, **kwargs):
        pass


class SpanWrapper:
    """Wraps a Langfuse span with generation and event logging."""

    def __init__(self, client, trace_id: str, name: str, metadata: dict):
        self._client = client
        self._trace_id = trace_id
        self._name = name
        self._span_id = None
        try:
            obs = self._client.start_observation(
                trace_id=trace_id,
                name=name,
                metadata=metadata,
                type="span",
            )
            self._span_id = getattr(obs, "id", None)
        except Exception:
            pass

    def generation(self, name: str = "llm-call", model: str = "", input=None, output=None, usage=None, **kwargs):
        try:
            self._client.start_observation(
                trace_id=self._trace_id,
                parent_observation_id=self._span_id,
                name=name,
                type="generation",
                model=model,
                input=str(input)[:2000] if input else None,
                output=str(output)[:2000] if output else None,
                usage=usage,
            )
        except Exception:
            pass
        return self

    def event(self, name: str, metadata: dict | None = None):
        try:
            self._client.create_event(
                trace_id=self._trace_id,
                name=name,
                metadata=metadata or {},
            )
        except Exception:
            pass

    def end(self):
        pass


def create_trace(incident_id: str, name: str = "incident-pipeline"):
    client = _get_client()
    if isinstance(client, _NoOp):
        return _NoOp()

    try:
        trace_id = client.create_trace_id()
        return TraceWrapper(client, trace_id, name, {"incident_id": incident_id})
    except Exception:
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
