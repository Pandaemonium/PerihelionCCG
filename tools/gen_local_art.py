r"""Batch photorealistic art generator for Tau Ceti using the installed Intel Arc A750 ComfyUI/FLUX stack.

Three-stage batching loads the text encoders ONCE, samples on the Arc A750 with the diffusion model
loaded ONCE, and decodes + packs WebP files incrementally so progress is resumable and live.

Run via:
  C:\AI\ComfyUI\.venv\Scripts\python.exe -u tools\gen_local_art.py --ids leader_ironwake bulwark_citadel
  C:\AI\ComfyUI\.venv\Scripts\python.exe -u tools\gen_local_art.py --batch leaders
  C:\AI\ComfyUI\.venv\Scripts\python.exe -u tools\gen_local_art.py --batch all
"""
import argparse
import gc
import importlib.util
import json
import logging
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROMPTS_FILE = ROOT / "tools" / "art_prompts.json"
RAW_DIR = ROOT / "art" / "raw"

AI_BASE = Path(r"C:\AI")
COMFY_DIR = AI_BASE / "ComfyUI"
MODELS_DIR = AI_BASE / "Models"
GGUF_DIR = COMFY_DIR / "custom_nodes" / "ComfyUI-GGUF"

PROFILES = {
    "dev": {
        "folder": "FLUX.1-dev-GGUF",
        "file": "flux1-dev-Q3_K_S.gguf",
        "label": "FLUX.1 Dev Q3_K_S",
        "family": "flux",
        "steps": 20,
        "cfg": 1.0,
        "guidance": 3.5,
        "sampler": "euler",
        "scheduler": "simple",
    },
    "unchained": {
        "folder": "FLUX-Unchained-Dev-GGUF",
        "file": "fluxunchained-dev-Q3_K_M.gguf",
        "label": "Flux Unchained Dev Q3_K_M",
        "family": "flux",
        "steps": 20,
        "cfg": 1.0,
        "guidance": 3.5,
        "sampler": "euler",
        "scheduler": "simple",
    },
    "realvis": {
        "folder": "RealVisXL-V5-Lightning",
        "file": "RealVisXL_V5.0_Lightning_fp16.safetensors",
        "label": "RealVisXL V5.0 Lightning FP16",
        "family": "sdxl",
        "steps": 6,
        "cfg": 2.0,
        "guidance": 1.0,
        "sampler": "dpmpp_sde",
        "scheduler": "karras",
        "clip_skip": 1,
        "card_width": 896,
        "card_height": 640,
        "leader_size": 768,
        "negative": "painting, illustration, cartoon, anime, CGI plastic, text, watermark, signature, border, frame, blurry, worst quality, low quality, deformed",
    },
    "cyberrealistic": {
        "folder": "CyberRealistic-Final",
        "file": "CyberRealistic_FINAL_FP16.safetensors",
        "label": "CyberRealistic Final FP16",
        "family": "sd15",
        "steps": 26,
        "cfg": 5.5,
        "guidance": 1.0,
        "sampler": "dpmpp_2m",
        "scheduler": "karras",
        "clip_skip": 1,
        "negative": "painting, illustration, cartoon, anime, 3d render, plastic, text, watermark, border, frame, blurry, worst quality, low quality, deformed",
    },
}


def select_items(all_items, args):
    if args.ids:
        want = set(args.ids)
        items = [x for x in all_items if x["id"] in want]
    elif args.batch == "leaders":
        items = [x for x in all_items if x.get("kind") == "leader"]
    elif args.batch == "projects":
        items = [x for x in all_items if x.get("type") == "project"]
    elif args.batch == "all":
        # Priority order: leaders -> secret projects -> faction cards -> neutrals/tokens
        def prio(x):
            if x.get("kind") == "leader":
                return 0
            if x.get("type") == "project":
                return 1
            if x.get("faction") not in (None, "neutral"):
                return 2
            return 3
        items = sorted(all_items, key=prio)
    else:
        items = [x for x in all_items if x.get("faction") == args.batch]

    if not args.overwrite:
        filtered = []
        for x in items:
            raw_png = RAW_DIR / f"{x['id']}.png"
            raw_jpg = RAW_DIR / f"{x['id']}.jpg"
            packed_webp = ROOT / "art" / f"{x['id']}.webp"
            if not raw_png.exists() and not raw_jpg.exists() and not packed_webp.exists():
                filtered.append(x)
        items = filtered
    elif not args.force:
        review_file = ROOT / "art" / "review_state.json"
        if review_file.exists():
            try:
                approved = {k for k, v in json.loads(review_file.read_text(encoding="utf-8")).get("statuses", {}).items() if v == "approved"}
                skipped = [x["id"] for x in items if x["id"] in approved]
                if skipped:
                    print(f"Skipping {len(skipped)} already-approved asset(s) (pass --force to overwrite approved art).", flush=True)
                    items = [x for x in items if x["id"] not in approved]
            except Exception:
                pass

    if args.limit and args.limit > 0:
        items = items[: args.limit]
    return items


def run_pack():
    sys.path.insert(0, str(ROOT / "tools"))
    import pack_art
    pack_art.main()


def main():
    parser = argparse.ArgumentParser(description="Batch-generate Tau Ceti card art on local Intel Arc A750.")
    parser.add_argument("--model", choices=PROFILES, default="dev")
    parser.add_argument("--batch", default="all", help="leaders | projects | all | <faction> (rootbound, ironwake, synod, tide, cinder, auric, redline, neutral)")
    parser.add_argument("--ids", nargs="*", help="Specific asset IDs to generate")
    parser.add_argument("--limit", type=int, default=0, help="Max images to generate this run (0 = all matching)")
    parser.add_argument("--steps", type=int, default=None)
    parser.add_argument("--guidance", type=float, default=None)
    parser.add_argument("--card-width", type=int, default=None)
    parser.add_argument("--card-height", type=int, default=None)
    parser.add_argument("--leader-size", type=int, default=None)
    parser.add_argument("--seed-base", type=int, default=77001)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--force", action="store_true", help="Allow --overwrite to regenerate already-approved assets")
    parser.add_argument("--chunk", type=int, default=12, help="Encode/generate/decode chunk size to cap RAM usage")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    all_items = json.loads(PROMPTS_FILE.read_text(encoding="utf-8"))
    items = select_items(all_items, args)
    if not items:
        print("Nothing to generate (all matching assets already exist). Use --overwrite to regenerate.")
        run_pack()
        return

    profile = PROFILES[args.model]
    steps = args.steps or profile["steps"]
    guidance = args.guidance if args.guidance is not None else profile["guidance"]
    card_w = args.card_width or profile.get("card_width", 672)
    card_h = args.card_height or profile.get("card_height", 480)
    leader_sz = args.leader_size or profile.get("leader_size", 512)
    model_file = MODELS_DIR / profile["folder"] / profile["file"]
    encoders_dir = MODELS_DIR / "FLUX.1-companions" / "text_encoders"
    clip_files = [encoders_dir / "t5xxl_fp16.safetensors", encoders_dir / "clip_l.safetensors"]
    vae_file = MODELS_DIR / "FLUX.1-companions" / "vae" / "ae.safetensors"

    print(f"Batch plan: {len(items)} image(s) using {profile['label']} ({steps} steps), card={card_w}x{card_h}, leader={leader_sz}x{leader_sz}", flush=True)

    os.environ.update({
        "ONEAPI_DEVICE_SELECTOR": "level_zero:gpu",
        "HF_HUB_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "DO_NOT_TRACK": "1",
        "TOKENIZERS_PARALLELISM": "false",
    })
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
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

    import numpy as np
    import torch
    from PIL import Image
    import comfy.model_management
    import comfy.sample
    import comfy.sd
    import comfy.utils

    devices = [torch.xpu.get_device_name(i) for i in range(torch.xpu.device_count())]
    dev_idx = next((i for i, n in enumerate(devices) if "A750" in n), 0)
    torch.xpu.set_device(dev_idx)
    print(f"GPU ready: {devices[dev_idx]}", flush=True)

    cpu = torch.device("cpu")
    t_total = time.monotonic()
    done_count = 0

    with torch.inference_mode():
        if profile["family"] == "flux":
            import folder_paths
            from comfy_extras.nodes_model_advanced import ModelSamplingFlux

            folder_paths.add_model_folder_path("diffusion_models", str(model_file.parent))
            spec = importlib.util.spec_from_file_location(
                "flux_cli_gguf", GGUF_DIR / "__init__.py", submodule_search_locations=[str(GGUF_DIR)]
            )
            ext = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = ext
            spec.loader.exec_module(ext)

            # Process in chunks so RAM stays tidy and WebP packs update continuously
            for ci in range(0, len(items), args.chunk):
                chunk = items[ci : ci + args.chunk]
                print(f"\n=== Chunk {ci // args.chunk + 1} ({len(chunk)} images): Encoding prompts on CPU ===", flush=True)
                clip = comfy.sd.load_clip(
                    ckpt_paths=[str(p) for p in clip_files],
                    clip_type=comfy.sd.CLIPType.FLUX,
                    model_options={"load_device": cpu, "offload_device": cpu},
                )
                conds = []
                for it in chunk:
                    pos = clip.encode_from_tokens_scheduled(clip.tokenize(it["prompt"]))
                    pos = [[t, {**d, "guidance": guidance}] for t, d in pos]
                    conds.append(pos)
                del clip
                comfy.model_management.unload_all_models()
                gc.collect()

                print(f"Loading {profile['label']} onto {devices[dev_idx]}...", flush=True)
                base_model = ext.NODE_CLASS_MAPPINGS["UnetLoaderGGUF"]().load_unet(model_file.name)[0]

                latents_out = []
                for idx, (it, pos) in enumerate(zip(chunk, conds)):
                    t0 = time.monotonic()
                    is_leader = it.get("kind") == "leader"
                    w = leader_sz if is_leader else card_w
                    h = leader_sz if is_leader else card_h
                    seed = args.seed_base + abs(hash(it["id"])) % 10_000_000
                    model = ModelSamplingFlux().patch(base_model, 1.15, 0.5, w, h)[0]
                    latent = torch.zeros(
                        [1, 16, h // 8, w // 8],
                        device=comfy.model_management.intermediate_device(),
                        dtype=comfy.model_management.intermediate_dtype(),
                    )
                    latent = comfy.sample.fix_empty_latent_channels(model, latent, 8)
                    noise = comfy.sample.prepare_noise(latent, seed)
                    samples = comfy.sample.sample(
                        model, noise, steps, 1.0, profile["sampler"], profile["scheduler"],
                        pos, pos, latent, disable_pbar=True, seed=seed,
                    )
                    latents_out.append((it, samples.cpu()))
                    print(f"  [{ci + idx + 1}/{len(items)}] Sampled {it['id']} ({w}x{h}) in {time.monotonic() - t0:.1f}s", flush=True)

                del base_model, conds
                comfy.model_management.unload_all_models()
                gc.collect()

                print("Decoding chunk with VAE on CPU...", flush=True)
                vae = comfy.sd.VAE(sd=comfy.utils.load_torch_file(str(vae_file), safe_load=True))
                for it, samples in latents_out:
                    decoded = vae.decode(samples)[0]
                    pixels = decoded.cpu().numpy()
                    img = Image.fromarray(np.clip(pixels * 255.0, 0, 255).astype(np.uint8))
                    out_png = RAW_DIR / f"{it['id']}.png"
                    img.save(out_png, format="PNG", compress_level=4)
                    done_count += 1
                del vae, latents_out
                gc.collect()
                run_pack()

        else:
            # SD 1.5 / SDXL checkpoint path (e.g. RealVisXL Lightning, CyberRealistic)
            print(f"Loading {profile['label']}...", flush=True)
            model, clip, vae, _ = comfy.sd.load_checkpoint_guess_config(
                str(model_file),
                model_options={"dtype": torch.float16},
                te_model_options={"load_device": cpu, "offload_device": cpu, "dtype": torch.float32},
                disable_dynamic=True,
            )
            clip.clip_layer(-profile.get("clip_skip", 1))
            neg_cond = clip.encode_from_tokens_scheduled(clip.tokenize(profile.get("negative", "")))
            for idx, it in enumerate(items):
                t0 = time.monotonic()
                is_leader = it.get("kind") == "leader"
                w = leader_sz if is_leader else card_w
                h = leader_sz if is_leader else card_h
                seed = args.seed_base + abs(hash(it["id"])) % 10_000_000
                pos_cond = clip.encode_from_tokens_scheduled(clip.tokenize(it["prompt"]))
                latent = torch.zeros(
                    [1, 4, h // 8, w // 8],
                    device=comfy.model_management.intermediate_device(),
                    dtype=comfy.model_management.intermediate_dtype(),
                )
                noise = comfy.sample.prepare_noise(latent, seed)
                samples = comfy.sample.sample(
                    model, noise, steps, profile["cfg"], profile["sampler"], profile["scheduler"],
                    pos_cond, neg_cond, latent, disable_pbar=True, seed=seed,
                )
                decoded = vae.decode(samples)[0]
                pixels = decoded.cpu().numpy()
                img = Image.fromarray(np.clip(pixels * 255.0, 0, 255).astype(np.uint8))
                out_png = RAW_DIR / f"{it['id']}.png"
                img.save(out_png, format="PNG", compress_level=4)
                done_count += 1
                print(f"  [{idx + 1}/{len(items)}] Generated {it['id']} ({w}x{h}) in {time.monotonic() - t0:.1f}s", flush=True)
                if done_count % 8 == 0:
                    run_pack()
            run_pack()

    print(f"\nAll done! Generated {done_count} image(s) in {time.monotonic() - t_total:.1f}s.", flush=True)


if __name__ == "__main__":
    main()
