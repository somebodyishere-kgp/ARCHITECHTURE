#!/usr/bin/env python3
"""
ArchFlow AI Bridge
- Reads JSON payload from stdin.
- Supports action=generate_floor_plan.
- Uses OpenRouter when api_key is provided.
- Falls back to deterministic local synthesis when remote call fails.
"""

import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Dict, List, Tuple


DEFAULT_MODEL = os.environ.get("ARCHFLOW_OPENROUTER_MODEL", "openrouter/hunter-alpha")


def _read_payload() -> Dict:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    return json.loads(raw)


def _write(data: Dict) -> None:
    print(json.dumps(data), flush=True)


def _extract_capacity(prompt: str) -> int:
    m = re.search(r"(\d{2,5})\s*(people|visitors|occupants|persons)", prompt, flags=re.IGNORECASE)
    if not m:
        return 300
    try:
        return max(50, int(m.group(1)))
    except Exception:
        return 300


def _extract_project_type(prompt: str) -> str:
    lower = prompt.lower()
    for k in ["museum", "office", "auditorium", "school", "hospital", "residential", "house", "apartment", "cafe"]:
        if k in lower:
            return k
    return "mixed-use"


def _extract_site(prompt: str) -> Tuple[float, float]:
    m = re.search(r"(\d+(?:\.\d+)?)\s*m\s*[x×]\s*(\d+(?:\.\d+)?)\s*m", prompt, flags=re.IGNORECASE)
    if not m:
        return (70.0, 40.0)
    return (float(m.group(1)), float(m.group(2)))


def _room_templates(project_type: str) -> List[str]:
    if project_type == "museum":
        return ["Lobby", "Exhibition A", "Exhibition B", "Auditorium", "Storage", "Cafe", "Services"]
    if project_type == "office":
        return ["Reception", "Open Office", "Meeting 1", "Meeting 2", "Director", "Pantry", "Services"]
    if project_type == "school":
        return ["Entry", "Classroom 1", "Classroom 2", "Staff", "Library", "Toilets", "Services"]
    return ["Entry", "Primary Space", "Secondary Space", "Support", "Toilets", "Services"]


def _json_from_openrouter(prompt: str, api_key: str, model: str) -> Dict:
    url = "https://openrouter.ai/api/v1/chat/completions"
    system = (
        "You are an architectural design intent parser. Return strict JSON with keys: "
        "project_type (string), rooms (array of strings), style (string), capacity (number), notes (array)."
    )
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://archflow.local",
            "X-Title": "ArchFlow",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    content = payload["choices"][0]["message"]["content"]
    return json.loads(content)


def _build_layout(prompt: str, intent: Dict, model: str, used_remote: bool) -> Dict:
    project_type = str(intent.get("project_type") or _extract_project_type(prompt))
    capacity = int(intent.get("capacity") or _extract_capacity(prompt))
    rooms = intent.get("rooms") or _room_templates(project_type)
    if not isinstance(rooms, list) or not rooms:
        rooms = _room_templates(project_type)

    site_w_m, site_h_m = _extract_site(prompt)
    bw = max(16000.0, site_w_m * 1000.0 * 0.8)
    bh = max(12000.0, site_h_m * 1000.0 * 0.8)

    entities: List[Dict] = []
    seq = 1

    def nid(prefix: str) -> str:
        nonlocal seq
        v = f"{prefix}{seq}"
        seq += 1
        return v

    # Outer walls
    for (x1, y1, x2, y2) in [
        (0.0, 0.0, bw, 0.0),
        (bw, 0.0, bw, bh),
        (bw, bh, 0.0, bh),
        (0.0, bh, 0.0, 0.0),
    ]:
        entities.append({
            "id": nid("w"),
            "type": "wall",
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "thickness": 250.0,
            "height": 3600.0,
            "layer": "Walls",
        })

    # Simple room grid partitions + room labels
    room_count = len(rooms)
    cols = int(math.ceil(math.sqrt(room_count)))
    rows = int(math.ceil(room_count / cols))
    cell_w = (bw - 800.0) / cols
    cell_h = (bh - 800.0) / rows

    for i in range(1, cols):
        x = 400.0 + i * cell_w
        entities.append({
            "id": nid("w"),
            "type": "wall",
            "x1": x,
            "y1": 400.0,
            "x2": x,
            "y2": bh - 400.0,
            "thickness": 150.0,
            "height": 3600.0,
            "layer": "Walls",
        })
    for j in range(1, rows):
        y = 400.0 + j * cell_h
        entities.append({
            "id": nid("w"),
            "type": "wall",
            "x1": 400.0,
            "y1": y,
            "x2": bw - 400.0,
            "y2": y,
            "thickness": 150.0,
            "height": 3600.0,
            "layer": "Walls",
        })

    for idx, name in enumerate(rooms):
        col = idx % cols
        row = idx // cols
        cx = 400.0 + col * cell_w + cell_w * 0.5
        cy = 400.0 + row * cell_h + cell_h * 0.5
        entities.append({
            "id": nid("t"),
            "type": "text",
            "x": cx,
            "y": cy,
            "text": str(name),
            "fontSize": 220.0,
            "rotation": 0.0,
            "layer": "Annotation",
            "align": "center",
        })

    # Entry door
    entities.append({
        "id": nid("d"),
        "type": "door",
        "x": bw * 0.5,
        "y": bh,
        "width": 1200.0,
        "height": 2100.0,
        "doorType": "double",
        "openDirection": "left",
        "layer": "Doors",
        "wallId": None,
    })

    # Window rhythm
    for ratio in [0.2, 0.4, 0.6, 0.8]:
        entities.append({
            "id": nid("wn"),
            "type": "window",
            "x": bw * ratio,
            "y": 0.0,
            "width": 1800.0,
            "height": 1200.0,
            "sillHeight": 900.0,
            "windowType": "fixed",
            "layer": "Windows",
            "wallId": None,
        })

    return {
        "version": "1.0",
        "generated_from_prompt": prompt,
        "building_type": project_type,
        "total_area": round((bw * bh) / 1_000_000.0, 2),
        "floor_height": 3600.0,
        "entities": entities,
        "layers": [
            {"name": "Walls", "color": "#ffffff", "visible": True, "locked": False, "lineweight": 0.25, "linetype": "continuous"},
            {"name": "Doors", "color": "#4a9eff", "visible": True, "locked": False, "lineweight": 0.25, "linetype": "continuous"},
            {"name": "Windows", "color": "#7dd3fc", "visible": True, "locked": False, "lineweight": 0.25, "linetype": "continuous"},
            {"name": "Annotation", "color": "#94a3b8", "visible": True, "locked": False, "lineweight": 0.18, "linetype": "continuous"},
        ],
        "ai_engine": {
            "provider": "openrouter" if used_remote else "local-fallback",
            "model": model,
            "capacity": capacity,
        },
    }


def handle_generate_floor_plan(payload: Dict) -> Dict:
    prompt = str(payload.get("prompt", "")).strip()
    api_key = payload.get("api_key")
    model = str(payload.get("model") or DEFAULT_MODEL)

    used_remote = False
    intent: Dict = {}

    if api_key:
        try:
            intent = _json_from_openrouter(prompt, str(api_key), model)
            used_remote = True
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="ignore")
            intent = {"notes": [f"OpenRouter HTTP {e.code}: {detail[:200]}"]}
        except Exception as e:
            intent = {"notes": [f"OpenRouter unavailable: {str(e)[:200]}"]}

    if not intent:
        intent = {
            "project_type": _extract_project_type(prompt),
            "rooms": _room_templates(_extract_project_type(prompt)),
            "capacity": _extract_capacity(prompt),
            "style": "contextual",
            "notes": ["deterministic fallback path"],
        }

    result = _build_layout(prompt, intent, model, used_remote)
    result["intent"] = intent
    return result


def main() -> int:
    try:
        payload = _read_payload()
        action = payload.get("action")
        if action == "generate_floor_plan":
            _write(handle_generate_floor_plan(payload))
            return 0
        _write({"ok": False, "error": f"Unsupported action: {action}"})
        return 1
    except Exception as e:
        _write({"ok": False, "error": f"ai_bridge failure: {e}"})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
