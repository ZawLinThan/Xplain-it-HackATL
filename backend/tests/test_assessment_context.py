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


def test_overlong_summary_retry_receives_length_constraint_and_preserves_all_sections():
    text = 'assessment code\n' * 1000
    parts = chunks(text)
    provider = FakeProvider({'summary': 'x' * 1001}, {'summary': 'valid shortened summary'},
                            *[{'summary': 'remaining section'} for _ in parts[1:]])
    result = prepare_assessment(provider, text)
    assert 'valid shortened summary' in result
    assert len(provider.calls) == len(parts) + 1
    assert '"maxLength": 1000' in provider.calls[0][0]
    assert 'string_too_long' in provider.calls[1][0]
    assert 'x' * 1001 not in provider.calls[1][0]
    assert provider.calls[0][1] == provider.calls[1][1]


def test_invalid_summary_errors_do_not_disclose_source_or_model_output():
    import pytest
    from app.llm import LLMError
    provider = FakeProvider({'summary': 'private-source-' * 100}, {'summary': 'private-source-' * 100})
    with pytest.raises(LLMError) as exc:
        prepare_assessment(provider, 'code' * 4000)
    assert 'string_too_long' in str(exc.value)
    assert 'private-source' not in str(exc.value)
