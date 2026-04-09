import os

import yaml


_config = None


def get_agent_config() -> dict:
    """Load team-configurable agent settings from YAML."""
    global _config
    if _config is not None:
        return _config

    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "agent-config.yaml")
    if not os.path.exists(config_path):
        _config = {}
        return _config

    with open(config_path, "r") as f:
        _config = yaml.safe_load(f) or {}
    return _config
