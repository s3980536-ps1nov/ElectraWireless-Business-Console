import json

def get_top5_by_country(json_path, countries):
    if isinstance(countries, str):
        countries = [countries]

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    result = {}

    for country in countries:
        filtered = [
            item for item in data
            if item.get("country") == country
        ]

        filtered.sort(key=lambda x: x.get("rank", float("inf")))

        top5 = [item["symbol"] for item in filtered[:5]]

        result[country] = top5

    return result


def main():
    json_path = "ydata/sp500_ranked.json"

    # 🔧 test input (change this freely)
    countries = [
        "United States",
        "Canada",
        "Ireland",
        "Switzerland",
        "Singapore"
    ]

    result = get_top5_by_country(json_path, countries)

    print("\n📊 Top 5 tickers by country:\n")
    for country, tickers in result.items():
        print(f"{country}: {tickers}")


if __name__ == "__main__":
    main()