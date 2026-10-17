"""Session-scoped speaker verification. Embeddings/audio never enter reports or logs."""
import atexit
import base64
import json
import math
import os
from pathlib import Path
import secrets
import select
import subprocess
import threading
import time

from . import db
from .errors import AppError

ROOT = Path(__file__).resolve().parent.parent


class EmbeddingEngine:
    def __init__(self):
        self.process = None
        self.lock = threading.Lock()

    @property
    def available(self):
        return os.getenv('VOICE_VERIFICATION_ENABLED', '1') != '0' and self.python.exists() and (ROOT / 'voice-models' / 'ready').exists()

    @property
    def python(self):
        return Path(os.getenv('VOICE_PYTHON', str(ROOT / '.venv-voice' / 'bin' / 'python')))

    def close(self):
        if self.process is not None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None

    def embed(self, pcm, minimum):
        if not self.available:
            raise AppError(503, 'voice_unavailable', 'Voice verification is unavailable. Install and warm up the optional voice worker.')
        with self.lock:
            if self.process is None or self.process.poll() is not None:
                self.process = subprocess.Popen([str(self.python), str(ROOT / 'app' / 'voice_worker.py')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            try:
                self.process.stdin.write(json.dumps({'pcm': base64.b64encode(pcm).decode(), 'minimum': minimum}) + '\n')
                self.process.stdin.flush()
            except OSError:
                self.close()
                raise AppError(503, 'voice_unavailable', 'Voice comparison failed. It has not been counted as a mismatch.')
            if not select.select([self.process.stdout], [], [], 60)[0]:
                self.close()
                raise AppError(503, 'voice_timeout', 'Voice comparison timed out. It has not been counted as a mismatch.')
            try:
                result = json.loads(self.process.stdout.readline())
            except (ValueError, OSError):
                self.close()
                raise AppError(503, 'voice_unavailable', 'Voice comparison failed. It has not been counted as a mismatch.')
            if result.get('error'):
                raise AppError(503, 'voice_unavailable', 'Speaker model could not process this audio.')
            return result


engine = EmbeddingEngine()
atexit.register(engine.close)
# References live only in this backend process, expire after one hour, and are erased on completion.
references = {}
checks = {}
state_lock = threading.Lock()


def expire(now):
    for key in list(references):
        if references[key]['expires'] < now:
            del references[key]
            for check_key in list(checks):
                if check_key[0] == key:
                    del checks[check_key]


def enroll(pcm):
    result = engine.embed(pcm, 5.0)
    if result['embedding'] is None:
        raise AppError(422, 'voice_needs_speech', 'Read the sentence aloud for at least 5 seconds of clear speech, then try again.')
    token = secrets.token_urlsafe(32)
    with state_lock:
        expire(time.monotonic())
        references[token] = {'vector': result['embedding'], 'expires': time.monotonic() + 3600}
    return {'enrollment_id': token}


def reference(token):
    with state_lock:
        expire(time.monotonic())
        value = references.get(token)
        if value is None:
            raise AppError(422, 'voice_enrollment_expired', 'Voice calibration expired. Please calibrate again.')
        return value


def bind(session_id, token):
    if token:
        value = reference(token)
        with state_lock:
            references[session_id] = value
            references.pop(token, None)


def forget(session_id):
    with state_lock:
        references.pop(session_id, None)
        for key in list(checks):
            if key[0] == session_id:
                del checks[key]


def verify(session_id, n, pcm, sequence, now=None):
    now = time.monotonic() if now is None else now
    with state_lock:
        expire(now)
        enrolled = references.get(session_id)
    if enrolled is None:
        return {'status': 'unavailable', 'flagged': False, 'similarity': None}
    try:
        result = engine.embed(pcm, 0.8)
    except AppError:
        with state_lock:
            checks.pop((session_id, n), None)
        raise
    vector = result['embedding']
    similarity = None
    status = 'insufficient_speech'
    if vector is not None:
        baseline = enrolled['vector']
        norm = math.sqrt(sum(x*x for x in vector) * sum(x*x for x in baseline))
        similarity = sum(a*b for a, b in zip(vector, baseline)) / norm if norm else None
        threshold = float(os.getenv('VOICE_SIMILARITY_THRESHOLD', '0.25'))
        if similarity is not None:
            status = 'mismatch' if similarity < threshold else 'match' if similarity >= threshold + 0.05 else 'uncertain'
    if n in db.list_answers(session_id):
        return {'status': 'unavailable', 'flagged': False, 'similarity': None}
    with state_lock:
        key = (session_id, n)
        previous = checks.get(key, {})
        if sequence <= previous.get('sequence', -1):
            raise AppError(409, 'voice_stale_chunk', 'An older voice chunk was ignored.')
        # Gaps, silence, uncertainty and matches break the continuous mismatch timer.
        since = previous.get('since') if now - previous.get('at', -1e10) <= 2.5 else None
        since = (now if since is None else since) if status == 'mismatch' else None
        newly_flagged = since is not None and now - since > 3 and not previous.get('episode_flagged', False)
        episode_flagged = status == 'mismatch' and ((previous.get('episode_flagged', False) and since == previous.get('since')) or newly_flagged)
        checks[key] = {'at': now, 'since': since, 'sequence': sequence, 'episode_flagged': episode_flagged}
        if newly_flagged:
            db.save_voice_flag(session_id, n, round((now - since) * 1000), similarity)
    return {'status': status, 'flagged': episode_flagged, 'similarity': similarity}
