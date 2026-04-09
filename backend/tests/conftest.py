"""Test configuration.

Pre-mock SQLAlchemy modules to avoid greenlet hangs during collection
on Windows. The state machine tests only need the pure-Python dict and
function from incident.py -- the ORM class definitions are irrelevant.
"""
import sys
from unittest.mock import MagicMock

# Only inject if sqlalchemy isn't already successfully loaded
if "sqlalchemy" not in sys.modules:
    _mock = MagicMock()
    for mod in [
        "sqlalchemy",
        "sqlalchemy.dialects",
        "sqlalchemy.dialects.postgresql",
        "sqlalchemy.orm",
        "sqlalchemy.ext",
        "sqlalchemy.ext.asyncio",
    ]:
        sys.modules[mod] = _mock
