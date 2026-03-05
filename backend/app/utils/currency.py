from decimal import Decimal
from babel.numbers import format_currency as babel_format_currency


CURRENCY_LOCALES = {
    "MYR": "ms_MY",
    "USD": "en_US",
    "EUR": "de_DE",
    "GBP": "en_GB",
    "SGD": "en_SG",
    "AUD": "en_AU",
    "JPY": "ja_JP",
    "CNY": "zh_CN",
}


def format_currency(amount: Decimal, currency: str = "MYR") -> str:
    locale = CURRENCY_LOCALES.get(currency, "en_US")
    try:
        return babel_format_currency(float(amount), currency, locale=locale)
    except Exception:
        return f"{currency} {amount:.2f}"


def convert_to_base(amount: Decimal, exchange_rate: Decimal) -> Decimal:
    if exchange_rate == 0:
        return amount
    return (amount / exchange_rate).quantize(Decimal("0.01"))
