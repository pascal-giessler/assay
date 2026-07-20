def apply_discount(price, percent):
    capped = percent if percent <= 50 else 50
    return round(price * (1 - capped / 100), 2)
