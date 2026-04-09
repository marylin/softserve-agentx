from src.config import settings


class _NoOp:
    """Stub that silently swallows every call when Langfuse is disabled."""

    def trace(self, *a, **kw):
        return self

    def span(self, *a, **kw):
        return self

    def generation(self, *a, **kw):
        return self

    def event(self, *a, **kw):
        return self

    def end(self, *a, **kw):
        return self

    def update(self, *a, **kw):
        return self


_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client

    if settings.langfuse_enabled and settings.langfuse_secret_key:
        from langfuse import Langfuse

        _client = Langfuse(
            secret_key=settings.langfuse_secret_key,
            public_key=settings.langfuse_public_key,
            host=settings.langfuse_host,
        )
    else:
        _client = _NoOp()
    return _client


def create_trace(incident_id: str, name: str = "incident-pipeline"):
    client = _get_client()
    return client.trace(name=name, metadata={"incident_id": incident_id})


def create_span(trace, name: str, metadata: dict | None = None):
    return trace.span(name=name, metadata=metadata or {})


def log_generation(span, model: str, input_text: str, output_text: str, usage: dict):
    return span.generation(
        model=model,
        input=input_text,
        output=output_text,
        usage=usage,
    )
