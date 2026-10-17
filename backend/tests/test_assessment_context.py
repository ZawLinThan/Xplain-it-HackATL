from app.assessment_context import chunks, prepare_assessment, MAX_CONTEXT_BYTES
from app.llm import CachedProvider, FakeProvider


def test_small_assessment_is_used_unchanged():
    provider = FakeProvider()
    text = 'class ShoppingCart { int total = 0; }'
    assert prepare_assessment(provider, text) == text
    assert provider.calls == []


def test_large_assessment_reads_every_section_and_reuses_cached_summaries():
    text = 'first file\n' + ('class A {}\n' * 2000) + '\nlast_file_unique_method'
    parts = chunks(text)
    provider = FakeProvider(*[{'summary': f'Section {i} actual code details'} for i in range(len(parts))])
    cached = CachedProvider(provider)
    context = prepare_assessment(cached, text)
    assert len(provider.calls) == len(parts)
    assert len(context.encode()) <= MAX_CONTEXT_BYTES
    for part, (_, user) in zip(parts, provider.calls):
        assert part in user
    assert 'last_file_unique_method' in provider.calls[-1][1]
    assert prepare_assessment(cached, text) == context
    assert len(provider.calls) == len(parts)


def test_utf8_chunks_preserve_all_source_without_exceeding_budget():
    text = 'နမူနာ java 漢字 🙂' * 1000
    parts = chunks(text)
    assert ''.join(parts) == text
    assert all(len(part.encode()) <= 8000 for part in parts)
