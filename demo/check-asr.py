"""Transcribe each narration clip with Whisper and compare to the script (catches TTS slips).
   python -I demo/check-asr.py demo/narration.json demo/audio"""
import json, re, sys
from pathlib import Path
import torch
from transformers import pipeline
spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
audio = Path(sys.argv[2])
items = spec.get("scenes") or spec.get("beats")
asr = pipeline("automatic-speech-recognition", model="openai/whisper-small.en", device=0, torch_dtype=torch.float16)
norm = lambda s: re.sub(r"[^a-z0-9 ]", "", s.lower().replace("-", " ")).split()
bad = 0
for b in items:
    text = b.get("say") or b.get("text")
    heard = asr(str(audio / f"{b['id']}.wav"))["text"].strip()
    a, h = norm(text), norm(heard)
    common = sum(1 for w in h if w in set(a))
    score = common / max(len(a), 1)
    flag = "OK  " if score > 0.9 and abs(len(a) - len(h)) <= 3 else "DIFF"
    bad += flag == "DIFF"
    print(f"{flag} {b['id']:<16} {score:.2f}  {heard}")
print("clips needing a listen:", bad)
