import numpy as np
import pandas as pd
from pathlib import Path

SAMPLE_DATA_PATH = Path(__file__).parent / "sample_data.csv"


def load_sample_data() -> list[dict]:
    df = pd.read_csv(SAMPLE_DATA_PATH)
    df["profit"] = df["revenue"] - df["expenses"]
    return df.to_dict(orient="records")


def project_forward(
        # test
    revenue: float,
    expenses: float,
    growth_rate: float,  # monthly % as decimal, e.g. 0.05 = 5%
    cost_growth_rate: float,  # monthly % as decimal
    months: int,
    what_if_annual_cost: float = 0.0,  # extra annual cost (e.g. $80k hire)
) -> list[dict]:
    """
    Simple compound-growth projection — no Prophet needed for demo.
    Returns a list of monthly dicts: { month, revenue, expenses, profit }
    """
    extra_monthly_cost = what_if_annual_cost / 12
    results = []

    for i in range(1, months + 1):
        projected_revenue = revenue * ((1 + growth_rate) ** i)
        projected_expenses = (expenses + extra_monthly_cost) * ((1 + cost_growth_rate) ** i)
        projected_profit = projected_revenue - projected_expenses
        results.append(
            {
                "month": i,
                "revenue": round(projected_revenue, 2),
                "expenses": round(projected_expenses, 2),
                "profit": round(projected_profit, 2),
            }
        )

    return results

def calculate_summary(forecast: list[dict]) -> dict:
    if not forecast:
        return {"total_revenue": 0.0, 
                "total_expenses": 0.0, 
                "total_profit": 0.0,
                "average_monthly_profit": 0.0,
                "best_month_profit": 0.0,
                "worst_month_profit": 0.0,
                "break_even_month": None,
                "final_month_revenue": 0.0,
                "final_month_profit": 0.0,
                "final_month_profit_margin": 0.0,
                }
    
    total_revenue = sum(item["revenue"] for item in forecast)
    total_expenses = sum(item["expenses"] for item in forecast)
    total_profit = sum(item["profit"] for item in forecast)
    average_monthly_profit = total_profit / len(forecast)

    best_month_profit = max(item["profit"] for item in forecast)
    worst_month_profit = min(item["profit"] for item in forecast)

    break_even_month = None
    for item in forecast:
        if item["profit"] >= 0:
            break_even_month = item["month"]
            break

    final_month = forecast[-1]
    final_month_revenue = final_month["revenue"]
    final_month_profit = final_month["profit"]
    final_month_profit_margin = (final_month_profit / final_month_revenue) * 100 if final_month_revenue > 0 else 0.0

    return {
        "total_revenue": round(total_revenue, 2),
        "total_expenses": round(total_expenses, 2),
        "total_profit": round(total_profit, 2),
        "average_monthly_profit": round(average_monthly_profit, 2),
        "best_month_profit": round(best_month_profit, 2),
        "worst_month_profit": round(worst_month_profit, 2),
        "break_even_month": break_even_month,
        "final_month_revenue": round(final_month_revenue, 2),
        "final_month_profit": round(final_month_profit, 2),
        "final_month_profit_margin": round(final_month_profit_margin, 2),
    }
