import pytest

from src.security.guardrails import ToolCallCounter, validate_agent_output


class TestValidateAgentOutput:
    def test_valid_json(self):
        output = '{"severity": "P1", "confidence": 0.9}'
        is_valid, parsed = validate_agent_output(output, ["severity", "confidence"])
        assert is_valid is True
        assert parsed["severity"] == "P1"
        assert parsed["confidence"] == 0.9

    def test_invalid_json(self):
        is_valid, parsed = validate_agent_output("not json at all", ["field"])
        assert is_valid is False
        assert parsed is None

    def test_missing_fields(self):
        output = '{"severity": "P1"}'
        is_valid, parsed = validate_agent_output(output, ["severity", "confidence"])
        assert is_valid is False
        assert parsed is None

    def test_extra_fields_ok(self):
        output = '{"severity": "P1", "confidence": 0.9, "extra": true}'
        is_valid, parsed = validate_agent_output(output, ["severity", "confidence"])
        assert is_valid is True
        assert parsed["extra"] is True

    def test_non_dict_json(self):
        is_valid, parsed = validate_agent_output("[1, 2, 3]", ["field"])
        assert is_valid is False
        assert parsed is None

    def test_string_json(self):
        is_valid, parsed = validate_agent_output('"just a string"', ["field"])
        assert is_valid is False
        assert parsed is None

    def test_none_input(self):
        is_valid, parsed = validate_agent_output(None, ["field"])
        assert is_valid is False
        assert parsed is None

    def test_empty_expected_fields(self):
        output = '{"any": "thing"}'
        is_valid, parsed = validate_agent_output(output, [])
        assert is_valid is True
        assert parsed == {"any": "thing"}


class TestToolCallCounter:
    def test_within_limit(self):
        counter = ToolCallCounter(max_calls=3)
        assert counter.increment() is True
        assert counter.increment() is True
        assert counter.increment() is True
        assert counter.count == 3

    def test_exceed_limit(self):
        counter = ToolCallCounter(max_calls=2)
        assert counter.increment() is True
        assert counter.increment() is True
        assert counter.increment() is False
        assert counter.count == 3

    def test_reset(self):
        counter = ToolCallCounter(max_calls=2)
        counter.increment()
        counter.increment()
        counter.increment()
        assert counter.count == 3
        counter.reset()
        assert counter.count == 0
        assert counter.increment() is True

    def test_default_max(self):
        counter = ToolCallCounter()
        assert counter.max_calls == 20

    def test_single_call_limit(self):
        counter = ToolCallCounter(max_calls=1)
        assert counter.increment() is True
        assert counter.increment() is False
