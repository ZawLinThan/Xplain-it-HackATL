import httpx


def test_speech_missing_key(client, monkeypatch):
    monkeypatch.delenv('ELEVENLABS_API_KEY', raising=False)
    response = client.post('/api/v1/speech', json={'text': 'Question'})
    assert response.status_code == 503


def test_speech_proxies_audio(client, monkeypatch):
    monkeypatch.setenv('ELEVENLABS_API_KEY', 'test-secret')
    async def post(self, url, **kwargs):
        assert kwargs['headers']['xi-api-key'] == 'test-secret'
        assert kwargs['json']['text'] == 'Question'
        assert kwargs['json']['model_id'] == 'eleven_v4'
        return httpx.Response(200, content=b'mp3', request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    response = client.post('/api/v1/speech', json={'text': 'Question'})
    assert response.status_code == 200
    assert response.content == b'mp3'
    assert response.headers['content-type'] == 'audio/mpeg'


def test_speech_hides_provider_errors(client, monkeypatch):
    monkeypatch.setenv('ELEVENLABS_API_KEY', 'test-secret')
    async def post(self, url, **kwargs):
        return httpx.Response(402, text='private provider details', request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    response = client.post('/api/v1/speech', json={'text': 'Question'})
    assert response.status_code == 502
    assert 'private provider details' not in response.text
