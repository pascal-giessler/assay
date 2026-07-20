from discount import apply_discount

def test_applies_percentage():
    assert apply_discount(100.0, 10.0) == 90.0

def test_zero_percent_is_full_price():
    assert apply_discount(100.0, 0.0) == 100.0
