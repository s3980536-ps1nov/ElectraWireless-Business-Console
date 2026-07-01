# test_ticker_resolution.py

import yfinance as yf


def resolve_ticker(company_name):
    """
    Resolve a company name to a Yahoo Finance ticker.
    Returns the best match found.
    """
    try:
        search = yf.Search(company_name)

        if not search.quotes:
            return None

        best = search.quotes[0]

        return {
            "query": company_name,
            "symbol": best.get("symbol"),
            "name": best.get("shortname") or best.get("longname"),
            # "exchange": best.get("exchange"),
            # "type": best.get("quoteType"),
        }

    except Exception as e:
        print(f"Error searching {company_name}: {e}")
        return None


def main():
    test_companies = [
        "Tesla",
        "Apple",
        "Meta",
        "Google",
        "NVIDIA",
        "Commonwealth Bank",
        "National Australia Bank",
        "BHP",
        "Rio Tinto",
        "Toyota",
        "Sony",
        "Tencent",
        "Nestle",
        "ASML",
    ]

    print("=" * 80)
    print("YAHOO FINANCE TICKER RESOLUTION TEST")
    print("=" * 80)

    for company in test_companies:
        result = resolve_ticker(company)

        if result:
            print(f"\nQuery:    {result['query']}")
            print(f"Ticker:   {result['symbol']}")
            print(f"Name:     {result['name']}")
            # print(f"Exchange: {result['exchange']}")
            # print(f"Type:     {result['type']}")
        else:
            print(f"\nQuery: {company}")
            print("No match found")


if __name__ == "__main__":
    main()