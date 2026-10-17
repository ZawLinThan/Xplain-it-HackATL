"""Write docs/openapi.json from the FastAPI app. Run from backend/: python scripts/gen_openapi.py"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402

out = ROOT.parent / "docs" / "openapi.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(app.openapi(), indent=2) + "\n")
print(f"wrote {out}")
