# -*- coding: utf-8 -*-
import os
import sys

if getattr(sys, "frozen", False):
    base = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    if base and base not in sys.path:
        sys.path.insert(0, base)
    exe_dir = os.path.dirname(sys.executable)
    if exe_dir and exe_dir not in sys.path:
        sys.path.insert(0, exe_dir)
else:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn

if __name__ == "__main__":
    host = os.environ.get("NEVZ_HOST", "127.0.0.1")
    port = int(os.environ.get("NEVZ_PORT", "8000"))
    uvicorn.run("api:app", host=host, port=port, log_level="info", workers=1)