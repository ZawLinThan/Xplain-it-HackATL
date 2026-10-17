import math
import pytest

from app import db, voice
from app.errors import AppError
from helpers import new_session, professor_session, PROF


@pytest.fixture(autouse=True)
def clean_voice_state(monkeypatch):
    voice.references.clear()
    voice.checks.clear()
    def embed(pcm, minimum):
        vector = None if pcm == b'silence' else [1.0, 0.0] if pcm == b'match' else [0.0, 1.0]
        return {'embedding': vector, 'speech_seconds': 0 if vector is None else 10}
    monkeypatch.setattr(voice.engine, 'embed', embed)
    yield
    voice.references.clear()
    voice.checks.clear()


def enrolled(client, llm):
    sid = new_session(client, llm)
    voice.references[sid] = {'vector': [1.0, 0.0], 'expires': math.inf}
    return sid


def test_enrollment_requires_consent_and_clear_speech(client):
    assert client.post('/api/v1/voice/enroll', content=bytes(320000), headers={'Content-Type': 'application/octet-stream'}).status_code == 422
    token = voice.enroll(b'match')['enrollment_id']
    assert len(token) > 30 and voice.reference(token)['vector'] == [1, 0]
    with pytest.raises(AppError, match='clear speech'):
        voice.enroll(b'silence')


def test_only_more_than_three_continuous_mismatch_seconds_flags_instructor(client, llm):
    sid = enrolled(client, llm)
    for seq, now in enumerate([100, 101, 102, 103]):
        assert not voice.verify(sid, 1, b'different', seq, now)['flagged']
    result = voice.verify(sid, 1, b'different', 4, 103.1)
    assert result['flagged'] is True
    # The same episode does not create a new flag on every following chunk.
    voice.verify(sid, 1, b'different', 5, 104)
    flags = professor_session(client, sid)['questions'][0]['voice_flags']
    assert len(flags) == 1 and flags[0]['duration_ms'] == 3100
    assert client.get(f'/api/v1/professor/sessions/{sid}').status_code == 401
    rows = client.get('/api/v1/professor/sessions', headers=PROF).json()['sessions']
    assert rows[0]['voice_flagged'] is True


def test_silence_matches_and_connection_gaps_reset_mismatch_timer(client, llm):
    sid = enrolled(client, llm)
    voice.verify(sid, 1, b'different', 0, 100)
    voice.verify(sid, 1, b'different', 1, 102)
    assert voice.verify(sid, 1, b'silence', 2, 103)['status'] == 'insufficient_speech'
    assert not voice.verify(sid, 1, b'different', 3, 104)['flagged']
    assert voice.verify(sid, 1, b'match', 4, 105)['status'] == 'match'
    assert not voice.verify(sid, 1, b'different', 5, 110)['flagged']
    assert not voice.verify(sid, 1, b'different', 6, 120)['flagged']
    assert db.list_voice_flags(sid) == {}


def test_uncertain_similarity_is_not_a_mismatch(client, llm, monkeypatch):
    sid = enrolled(client, llm)
    monkeypatch.setattr(voice.engine, 'embed', lambda *args: {'embedding': [0.28, (1-0.28**2)**0.5], 'speech_seconds': 3})
    for seq in range(10):
        result = voice.verify(sid, 1, b'x', seq, 100+seq)
        assert result['status'] == 'uncertain' and not result['flagged']
    assert db.list_voice_flags(sid) == {}


def test_missing_reference_is_unavailable_and_expired_references_are_removed(client, llm):
    sid = new_session(client, llm)
    assert voice.verify(sid, 1, b'x', 0, 100)['status'] == 'unavailable'
    voice.references[sid] = {'vector': [1, 0], 'expires': 99}
    assert voice.verify(sid, 1, b'x', 1, 100)['status'] == 'unavailable'
    assert sid not in voice.references


def test_enrollment_is_bound_once_and_erased_without_losing_flags(client, llm):
    sid = new_session(client, llm)
    token = voice.enroll(b'match')['enrollment_id']
    voice.bind(sid, token)
    assert token not in voice.references and sid in voice.references
    db.save_voice_flag(sid, 1, 3200, 0.1)
    voice.forget(sid)
    assert sid not in voice.references
    assert len(db.list_voice_flags(sid)[1]) == 1


def test_stale_chunks_cannot_extend_a_mismatch(client, llm):
    sid = enrolled(client, llm)
    voice.verify(sid, 1, b'different', 1, 100)
    with pytest.raises(AppError) as exc:
        voice.verify(sid, 1, b'different', 1, 104)
    assert exc.value.code == 'voice_stale_chunk'
    assert db.list_voice_flags(sid) == {}


def test_service_failure_resets_continuous_mismatch(client, llm, monkeypatch):
    sid = enrolled(client, llm)
    voice.verify(sid, 1, b'different', 0, 100)
    original = voice.engine.embed
    def fail(*args):
        raise AppError(503, 'voice_unavailable', 'Unavailable')
    monkeypatch.setattr(voice.engine, 'embed', fail)
    with pytest.raises(AppError):
        voice.verify(sid, 1, b'different', 1, 102)
    monkeypatch.setattr(voice.engine, 'embed', original)
    assert not voice.verify(sid, 1, b'different', 2, 104)['flagged']
    assert db.list_voice_flags(sid) == {}
