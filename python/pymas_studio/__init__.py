"""PyMAS Studio bridge package.

The web application is fully static; this package only starts a local HTTP
server that serves the compiled frontend and exposes one model at
``/api/model.json`` so a notebook or script can open it in the browser.
"""

from .server import show

__all__ = ["show"]
__version__ = "0.1.1"
