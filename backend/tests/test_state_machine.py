import pytest

from src.models.incident import VALID_TRANSITIONS, validate_transition


class TestValidTransitions:
    def test_received_to_triaging(self):
        assert validate_transition("received", "triaging") is True

    def test_received_to_failed(self):
        assert validate_transition("received", "failed") is True

    def test_triaging_to_triaged(self):
        assert validate_transition("triaging", "triaged") is True

    def test_triaging_to_failed(self):
        assert validate_transition("triaging", "failed") is True

    def test_triaged_to_routed(self):
        assert validate_transition("triaged", "routed") is True

    def test_triaged_to_failed(self):
        assert validate_transition("triaged", "failed") is True

    def test_routed_to_resolved(self):
        assert validate_transition("routed", "resolved") is True

    def test_routed_to_failed(self):
        assert validate_transition("routed", "failed") is True


class TestInvalidTransitions:
    def test_received_to_triaged(self):
        assert validate_transition("received", "triaged") is False

    def test_received_to_routed(self):
        assert validate_transition("received", "routed") is False

    def test_received_to_resolved(self):
        assert validate_transition("received", "resolved") is False

    def test_triaging_to_routed(self):
        assert validate_transition("triaging", "routed") is False

    def test_triaging_to_resolved(self):
        assert validate_transition("triaging", "resolved") is False

    def test_triaged_to_resolved(self):
        assert validate_transition("triaged", "resolved") is False

    def test_unknown_state(self):
        assert validate_transition("nonexistent", "triaging") is False


class TestTerminalStates:
    def test_resolved_is_terminal(self):
        assert validate_transition("resolved", "received") is False
        assert validate_transition("resolved", "triaging") is False
        assert validate_transition("resolved", "triaged") is False
        assert validate_transition("resolved", "routed") is False
        assert validate_transition("resolved", "failed") is False

    def test_failed_is_terminal(self):
        assert validate_transition("failed", "received") is False
        assert validate_transition("failed", "triaging") is False
        assert validate_transition("failed", "triaged") is False
        assert validate_transition("failed", "routed") is False
        assert validate_transition("failed", "resolved") is False

    def test_terminal_states_have_empty_transitions(self):
        assert VALID_TRANSITIONS["resolved"] == set()
        assert VALID_TRANSITIONS["failed"] == set()


class TestNoSkipStates:
    """Ensure the pipeline cannot skip stages."""

    def test_cannot_skip_triaging(self):
        # received -> triaged (skip triaging)
        assert validate_transition("received", "triaged") is False

    def test_cannot_skip_triage_to_route(self):
        # received -> routed (skip triaging + triaged)
        assert validate_transition("received", "routed") is False

    def test_cannot_skip_routing(self):
        # triaging -> routed (skip triaged)
        assert validate_transition("triaging", "routed") is False

    def test_cannot_skip_to_resolved(self):
        # triaged -> resolved (skip routed)
        assert validate_transition("triaged", "resolved") is False
