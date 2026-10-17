"""Isolated CPU speaker-embedding worker. JSON protocol; no audio is written to disk."""
import base64
import contextlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'voice-models'
os.environ.setdefault('HF_HOME', str(CACHE / 'huggingface'))
model = None


def load_model():
    global model
    if model is None:
        with contextlib.redirect_stdout(sys.stderr):
            import torch
            from speechbrain.inference.speaker import EncoderClassifier
            torch.set_num_threads(2)
            model = EncoderClassifier.from_hparams(
                source='speechbrain/spkrec-ecapa-voxceleb',
                savedir=str(CACHE / 'ecapa'), run_opts={'device': 'cpu'},
            )
        CACHE.mkdir(parents=True, exist_ok=True)
        (CACHE / 'ready').write_text('speechbrain/spkrec-ecapa-voxceleb\n')
    return model


def embed(pcm, minimum):
    import numpy as np
    import torch
    import webrtcvad
    vad = webrtcvad.Vad(2)
    frames = [pcm[i:i+960] for i in range(0, len(pcm) - 959, 960)]  # 30 ms, 16 kHz, s16le
    voiced = [frame for frame in frames if vad.is_speech(frame, 16000)]
    seconds = len(voiced) * 0.03
    if seconds < minimum:
        return {'embedding': None, 'speech_seconds': seconds}
    signal = np.frombuffer(b''.join(voiced), dtype='<i2').astype(np.float32) / 32768
    with torch.inference_mode():
        vector = load_model().encode_batch(torch.from_numpy(signal).unsqueeze(0)).flatten()
        vector = torch.nn.functional.normalize(vector, dim=0)
    return {'embedding': vector.tolist(), 'speech_seconds': seconds}


if __name__ == '__main__':
    if '--warmup' in sys.argv:
        load_model()
        print('Speaker model ready')
    else:
        for line in sys.stdin:
            try:
                request = json.loads(line)
                result = embed(base64.b64decode(request['pcm']), request.get('minimum', 0.8))
            except Exception as exc:
                print(f'Speaker worker failed: {type(exc).__name__}', file=sys.stderr)
                result = {'error': type(exc).__name__}
            print(json.dumps(result), flush=True)
