"""Explainer narration with local Qwen3-TTS (open source, Apache 2.0).

Reuses the proof video's designed voice (demo/audio/voice_ref.wav) so both videos sound like the same person,
and clones it for every beat in ONE batched call. Writes audio/<beat>.wav; then run scripts/assemble.mjs.

  <venv>/Scripts/python.exe -I explainer/scripts/tts.py [beat-id ...]
"""
import json
import sys
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

HERE = Path(__file__).resolve().parent.parent
spec = json.loads((HERE / "narration.json").read_text(encoding="utf8"))
voice = spec["voice"]
audio = HERE / "audio"
audio.mkdir(exist_ok=True)
ref = (HERE / voice["reuse_ref"]).resolve()
if not ref.exists():
    sys.exit(f"missing {ref}: run demo/tts.py first, it designs the voice")

only = set(sys.argv[1:])
beats = [b for b in spec["beats"] if not only or b["id"] in only]
cloner = Qwen3TTSModel.from_pretrained(voice["clone_model"], device_map="cuda:0", dtype=torch.bfloat16)
prompt = cloner.create_voice_clone_prompt(ref_audio=str(ref), ref_text=voice["reference_text"])
torch.manual_seed(voice["seed"])
wavs, sr = cloner.generate_voice_clone(text=[b["text"] for b in beats], language="English", voice_clone_prompt=prompt)
for b, w in zip(beats, wavs):
    sf.write(audio / f"{b['id']}.wav", w, sr)
    print("wrote", b["id"], round(len(w) / sr, 2), "s", flush=True)
