"""Narration for the demo video, generated locally with Qwen3-TTS (open source, Apache 2.0).

Designs one voice from narration.json's "instruct", then clones it for every scene in ONE batched call
(much faster than line by line). Writes audio/<scene>.wav and audio/durations.json, which the recorder
uses to pace each scene so the narration always fits.

Run with a Python env that has qwen-tts + a CUDA torch, e.g.:
  <venv>/Scripts/python.exe -I demo/tts.py
"""
import json
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HERE = Path(__file__).resolve().parent
spec = json.loads((HERE / "narration.json").read_text(encoding="utf8"))
voice = spec["voice"]
audio = HERE / "audio"
audio.mkdir(exist_ok=True)
load = lambda name: Qwen3TTSModel.from_pretrained(name, device_map="cuda:0", dtype=torch.bfloat16)

ref = audio / "voice_ref.wav"
if not ref.exists():
    designer = load(voice["design_model"])
    torch.manual_seed(voice["seed"])
    wavs, sr = designer.generate_voice_design(text=voice["reference_text"], language="English", instruct=voice["instruct"])
    sf.write(ref, wavs[0], sr)
    print("designed voice ->", ref.name, flush=True)
    del designer
    torch.cuda.empty_cache()

cloner = load(voice["clone_model"])
prompt = cloner.create_voice_clone_prompt(ref_audio=str(ref), ref_text=voice["reference_text"])
torch.manual_seed(voice["seed"])
wavs, sr = cloner.generate_voice_clone(text=[s["say"] for s in spec["scenes"]], language="English", voice_clone_prompt=prompt)
durations = {}
for scene, w in zip(spec["scenes"], wavs):
    sf.write(audio / f"{scene['id']}.wav", w, sr)
    durations[scene["id"]] = round(len(w) / sr, 2)
    print("wrote", scene["id"], durations[scene["id"]], "s", flush=True)
(audio / "durations.json").write_text(json.dumps(durations, indent=2))
