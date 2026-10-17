import pytest

from app import scoring


def test_examples_from_spec():
    p = scoring.problem_score(22, 30)
    assert p == pytest.approx(0.7333, abs=1e-4)

    e = scoring.explanation_score([5, 3, 2])
    assert e == pytest.approx(0.6667, abs=1e-4)
    assert scoring.final_score(p, e, 0.6, 0.4) == 70.7
    assert scoring.review_flag(p, e) is False

    e = scoring.explanation_score([1, 1, 0])
    assert e == pytest.approx(0.1333, abs=1e-4)
    assert scoring.final_score(p, e, 0.6, 0.4) == 49.3
    assert scoring.review_flag(p, e) is True

    e = scoring.explanation_score([5, 5, 5])
    assert e == 1.0
    assert scoring.final_score(p, e, 0.6, 0.4) == 84.0
    assert scoring.review_flag(p, e) is False


def test_total_zero_gives_zero_p():
    assert scoring.problem_score(5, 0) == 0.0


def test_p_is_bounded():
    assert scoring.problem_score(40, 30) == 1.0
    assert scoring.problem_score(-3, 30) == 0.0


def test_empty_scores_give_zero_e():
    assert scoring.explanation_score([]) == 0.0


def test_scores_are_clamped():
    assert scoring.clamp_score(9) == 5
    assert scoring.clamp_score(-2) == 0
    assert scoring.explanation_score([9, 9, 9]) == 1.0
    assert scoring.explanation_score([-4, -4]) == 0.0


def test_weights_are_normalized():
    assert scoring.normalize_weights(3, 1) == (0.75, 0.25)
    assert scoring.final_score(1.0, 0.0, 6, 4) == 60.0
    assert scoring.normalize_weights(0, 0) == (0.6, 0.4)
    assert scoring.normalize_weights(-1, 1) == (0.0, 1.0)


def test_review_flag_float_noise():
    # 0.8 - 0.4 is 0.4000000000000001 in binary floats and must not trip a 0.40 threshold
    assert scoring.review_flag(0.8, 0.4) is False
    assert scoring.review_flag(0.81, 0.4) is True


def test_final_rounds_half_up():
    assert scoring.final_score(0.5, 0.5, 0.5, 0.5) == 50.0
    assert scoring.final_score(0.7025, 0.0, 1.0, 0.0) == 70.3
