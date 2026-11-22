r"""Local Art Review Studio server for Tau Ceti.

Serves the game root on http://127.0.0.1:8765/art/art_review.html and exposes
local-only endpoints to edit prompts on disk and reroll cards live on the Intel Arc A750.

Launch via:
  tools\start_art_review.cmd
or:
  C:\AI\ComfyUI\.venv\Scripts\python.exe -u tools\review_server.py
"""
import gc
import http.server
import json
import logging
import os
import secrets
import socketserver
import subprocess
import sys
import threading
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = ROOT / "tools"
PROMPTS_JSON = TOOLS_DIR / "art_prompts.json"
PROMPTS_JS = TOOLS_DIR / "art_prompts.js"
RAW_DIR = ROOT / "art" / "raw"
ART_DIR = ROOT / "art"
REVIEW_JSON = ART_DIR / "review_state.json"
REVIEW_JS = ART_DIR / "review_state.js"

AI_BASE = Path(r"C:\AI")
COMFY_DIR = AI_BASE / "ComfyUI"
MODELS_DIR = AI_BASE / "Models"

sys.path.insert(0, str(TOOLS_DIR))
import pack_art  # noqa: E402
import gen_local_art as gla  # noqa: E402

GPU_LOCK = threading.Lock()
STATE = {
    "busy": False,
    "current": None,
    "loaded_model_key": None,
    "comfy_ready": False,
    "pipeline": None,  # (model, clip, vae, neg_cond, profile)
}


def load_prompts():
    return json.loads(PROMPTS_JSON.read_text(encoding="utf-8"))


def save_prompts(items):
    PROMPTS_JSON.write_text(json.dumps(items, indent=2), encoding="utf-8")
    PROMPTS_JS.write_text(
        "/* Auto-generated from art_prompts.json */\nwindow.TauCetiPrompts = "
        + json.dumps(items)
        + ";\n",
        encoding="utf-8",
    )


def load_review_state():
    if not REVIEW_JSON.exists():
        return {"statuses": {}, "prompts": {}, "notes": {}}
    try:
        return json.loads(REVIEW_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {"statuses": {}, "prompts": {}, "notes": {}}


def save_review_state(state: dict):
    clean = {
        "statuses": state.get("statuses") or {},
        "prompts": state.get("prompts") or {},
        "notes": state.get("notes") or {},
    }
    REVIEW_JSON.write_text(json.dumps(clean, indent=2), encoding="utf-8")
    REVIEW_JS.write_text(
        "/* Persisted art review approvals & state (synced with art/review_state.json) */\n"
        "window.TauCetiReviewState = " + json.dumps(clean) + ";\n",
        encoding="utf-8",
    )
    return clean


def update_prompt_on_disk(asset_id: str, new_prompt: str, meta: dict | None = None) -> bool:
    items = load_prompts()
    found = False
    for it in items:
        if it["id"] == asset_id:
            it["prompt"] = new_prompt.strip()
            found = True
            break
    if not found:
        is_leader = asset_id.startswith("leader_")
        entry = {
            "id": asset_id,
            "kind": "leader" if is_leader else None,
            "width": 1024,
            "height": 1024 if is_leader else 768,
            "prompt": new_prompt.strip(),
        }
        if meta:
            entry.update({k: v for k, v in meta.items() if k in ("name", "faction", "type", "negative") and v})
        if entry["kind"] is None:
            del entry["kind"]
        items.append(entry)
    save_prompts(items)
    return True


def ensure_comfy_init():
    if STATE["comfy_ready"]:
        return
    os.environ.update({
        "ONEAPI_DEVICE_SELECTOR": "level_zero:gpu",
        "HF_HUB_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "DO_NOT_TRACK": "1",
        "TOKENIZERS_PARALLELISM": "false",
    })
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    if str(COMFY_DIR) not in sys.path:
        sys.path.insert(0, str(COMFY_DIR))

    from comfy.cli_args import args as cargs
    cargs.lowvram = True
    cargs.disable_dynamic_vram = True
    cargs.cpu_vae = True
    cargs.use_pytorch_cross_attention = True
    cargs.reserve_vram = 1.0
    cargs.offline = True
    cargs.disable_metadata = True
    cargs.disable_comfy_compiler = True
    cargs.disable_cuda_graphs = True

    import torch
    devices = [torch.xpu.get_device_name(i) for i in range(torch.xpu.device_count())]
    dev_idx = next((i for i, n in enumerate(devices) if "A750" in n), 0)
    torch.xpu.set_device(dev_idx)
    print(f"[GPU] Initialized {devices[dev_idx]}", flush=True)
    STATE["comfy_ready"] = True


def unload_warm_model():
    if STATE["pipeline"] is not None:
        STATE["pipeline"] = None
        STATE["loaded_model_key"] = None
        try:
            import comfy.model_management
            comfy.model_management.unload_all_models()
        except Exception:
            pass
        gc.collect()


def reroll_asset(asset_id: str, prompt_text: str | None, model_key: str, seed: int | None):
    if model_key not in gla.PROFILES:
        raise ValueError(f"Unknown model: {model_key}")
    items = load_prompts()
    item = next((x for x in items if x["id"] == asset_id), None)
    if item is None:
        if not prompt_text or not prompt_text.strip():
            raise ValueError(f"Unknown asset id without prompt: {asset_id}")
        is_leader = asset_id.startswith("leader_")
        item = {
            "id": asset_id,
            "width": 1024,
            "height": 1024 if is_leader else 768,
            "prompt": prompt_text.strip(),
        }
        if is_leader:
            item["kind"] = "leader"
        items.append(item)
        save_prompts(items)
    elif prompt_text is not None and prompt_text.strip() and prompt_text.strip() != item["prompt"]:
        item["prompt"] = prompt_text.strip()
        save_prompts(items)

    seed = int(seed) if seed is not None and str(seed).strip() != "" else secrets.randbelow(900_000_000) + 1
    profile = gla.PROFILES[model_key]
    t0 = time.monotonic()

    # Remove old raw jpg if present so pack_art uses the fresh PNG cleanly
    old_jpg = RAW_DIR / f"{asset_id}.jpg"
    if old_jpg.exists():
        old_jpg.unlink()

    if profile["family"] == "flux":
        unload_warm_model()
        cmd = [
            sys.executable, "-u", str(TOOLS_DIR / "gen_local_art.py"),
            "--model", model_key, "--ids", asset_id, "--overwrite", "--seed-base", str(seed),
        ]
        res = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(res.stderr or res.stdout or "FLUX reroll failed")
    else:
        ensure_comfy_init()
        import numpy as np
        import torch
        from PIL import Image
        import comfy.model_management
        import comfy.sample
        import comfy.sd

        if STATE["loaded_model_key"] != model_key:
            unload_warm_model()
            print(f"[GPU] Loading {profile['label']}...", flush=True)
            model_file = MODELS_DIR / profile["folder"] / profile["file"]
            cpu = torch.device("cpu")
            model, clip, vae, _ = comfy.sd.load_checkpoint_guess_config(
                str(model_file),
                model_options={"dtype": torch.float16},
                te_model_options={"load_device": cpu, "offload_device": cpu, "dtype": torch.float32},
                disable_dynamic=True,
            )
            clip.clip_layer(-profile.get("clip_skip", 1))
            neg_cond = clip.encode_from_tokens_scheduled(clip.tokenize(profile.get("negative", "")))
            STATE["pipeline"] = (model, clip, vae, neg_cond, profile)
            STATE["loaded_model_key"] = model_key

        model, clip, vae, neg_cond, profile = STATE["pipeline"]
        is_leader = item.get("kind") == "leader"
        w = profile.get("leader_size", 512) if is_leader else profile.get("card_width", 672)
        h = profile.get("leader_size", 512) if is_leader else profile.get("card_height", 480)

        with torch.inference_mode():
            pos_cond = clip.encode_from_tokens_scheduled(clip.tokenize(item["prompt"]))
            latent = torch.zeros(
                [1, 4, h // 8, w // 8],
                device=comfy.model_management.intermediate_device(),
                dtype=comfy.model_management.intermediate_dtype(),
            )
            noise = comfy.sample.prepare_noise(latent, seed)
            samples = comfy.sample.sample(
                model, noise, profile["steps"], profile["cfg"], profile["sampler"], profile["scheduler"],
                pos_cond, neg_cond, latent, disable_pbar=True, seed=seed,
            )
            decoded = vae.decode(samples)[0]
            pixels = decoded.cpu().numpy()
            img = Image.fromarray(np.clip(pixels * 255.0, 0, 255).astype(np.uint8))
            RAW_DIR.mkdir(parents=True, exist_ok=True)
            out_png = RAW_DIR / f"{asset_id}.png"
            img.save(out_png, format="PNG", compress_level=4)
            # Pack just this file & refresh manifest
            pack_art.process_one(out_png, ART_DIR / f"{asset_id}.webp")
            pack_art.main()

    webp_path = ART_DIR / f"{asset_id}.webp"
    webp_kb = round(webp_path.stat().st_size / 1024, 1) if webp_path.exists() else 0
    elapsed = round(time.monotonic() - t0, 1)
    print(f"[GPU] Rerolled {asset_id} ({model_key}, seed={seed}) in {elapsed}s -> {webp_kb} KB", flush=True)
    return {"ok": True, "id": asset_id, "seed": seed, "elapsed": elapsed, "webp_kb": webp_kb, "model": model_key}


class ReviewHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        # Keep console focused on API/GPU actions
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def send_json(self, code: int, obj: dict):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/ping":
            sizes = {p.stem: round(p.stat().st_size / 1024, 1) for p in ART_DIR.glob("*.webp")}
            return self.send_json(200, {
                "ok": True,
                "busy": STATE["busy"],
                "current": STATE["current"],
                "loadedModel": STATE["loaded_model_key"],
                "sizes": sizes,
            })
        if parsed.path == "/api/prompts":
            return self.send_json(200, {"ok": True, "prompts": load_prompts()})
        if parsed.path == "/api/review_state":
            return self.send_json(200, {"ok": True, "state": load_review_state()})
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            return self.send_json(400, {"ok": False, "error": "Invalid JSON"})

        if parsed.path == "/api/review_state":
            saved = save_review_state(data)
            return self.send_json(200, {"ok": True, "approved": sum(1 for v in saved["statuses"].values() if v == "approved")})

        if parsed.path == "/api/save_prompt":
            aid = data.get("id")
            prompt = data.get("prompt", "")
            if not aid or not prompt.strip():
                return self.send_json(400, {"ok": False, "error": "Missing id or prompt"})
            update_prompt_on_disk(aid, prompt, data.get("meta"))
            return self.send_json(200, {"ok": True, "id": aid})

        if parsed.path == "/api/reroll":
            aid = data.get("id")
            prompt = data.get("prompt")
            model_key = data.get("model") or "realvis"
            seed = data.get("seed")
            if not aid:
                return self.send_json(400, {"ok": False, "error": "Missing id"})
            with GPU_LOCK:
                STATE["busy"] = True
                STATE["current"] = aid
                try:
                    res = reroll_asset(aid, prompt, model_key, seed)
                    return self.send_json(200, res)
                except Exception as exc:
                    return self.send_json(500, {"ok": False, "error": str(exc)})
                finally:
                    STATE["busy"] = False
                    STATE["current"] = None

        return self.send_json(404, {"ok": False, "error": "Unknown endpoint"})


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def main():
    base_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8795
    server = None
    port = base_port
    for candidate in range(base_port, base_port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", candidate), ReviewHandler)
            port = candidate
            break
        except OSError:
            continue
    if server is None:
        raise RuntimeError(f"No free port found in range {base_port}-{base_port + 19}")
    url = f"http://127.0.0.1:{port}/art/art_review.html"
    print(f"Tau Ceti Art Review Studio running at {url}", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    if "--open" in sys.argv:
        import webbrowser
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Art Review Studio.", flush=True)
    finally:
        unload_warm_model()
        server.server_close()


if __name__ == "__main__":
    main()
