"""Build the aggregated summary JSON used by the presentation site.

Usage:
    python scripts/build_summary.py path/to/26407c45-PCard-OSU-2014.csv

Writes site/data/summary.json. The raw CSV is not committed to the repository.
"""

import argparse
import json
from pathlib import Path

import pandas as pd

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday",
            "Friday", "Saturday", "Sunday"]
TOP_N = 12


def normalize_text(series: pd.Series) -> pd.Series:
    """Lowercase and collapse runs of whitespace so vendor names group cleanly."""
    return series.str.lower().str.split().str.join(" ")


def money(value: float) -> float:
    return round(float(value), 2)


def group_top(df: pd.DataFrame, key: str, n: int = TOP_N) -> list[dict]:
    grouped = (
        df.groupby(key)["amount"]
        .agg(net="sum", count="size")
        .sort_values("net", ascending=False)
        .head(n)
        .reset_index()
    )
    return [
        {"name": row[key], "net": money(row["net"]), "count": int(row["count"])}
        for _, row in grouped.iterrows()
    ]


def build(csv_path: Path) -> dict:
    df = pd.read_csv(csv_path, dtype={"transaction_id": str}, keep_default_na=False)
    df["amount"] = pd.to_numeric(df["amount"], errors="raise")
    df["txn_date"] = pd.to_datetime(df["transaction_date"], errors="raise")
    df["posted"] = pd.to_datetime(df["posted_date"], errors="raise")
    df["vendor_n"] = normalize_text(df["vendor"])
    df["mcc_n"] = normalize_text(df["mcc"])
    df["cardholder"] = df["unique_name"].str.strip()
    df["description_n"] = normalize_text(df["description"])

    total_net = df["amount"].sum()
    credits = df[df["amount"] < 0]
    purchases = df[df["amount"] > 0]

    month_group = df.assign(m=df["txn_date"].dt.month).groupby("m")["amount"]
    month_net = month_group.sum()
    month_count = month_group.size()
    monthly = [
        {"month": MONTHS[m - 1], "net": money(month_net.get(m, 0.0)),
         "count": int(month_count.get(m, 0))}
        for m in range(1, 13)
    ]
    peak = max(monthly, key=lambda r: r["net"])
    low = min(monthly, key=lambda r: r["net"])

    travel = df[df["description_n"].isin(["room charges", "air travel"])]
    travel_by_type = (
        travel.groupby("description_n")["amount"].agg(net="sum", count="size")
        .reset_index()
    )

    weekday_group = df.assign(w=df["txn_date"].dt.day_name()).groupby("w")["amount"]
    weekday = [
        {"day": day, "net": money(weekday_group.sum().get(day, 0.0)),
         "count": int(weekday_group.size().get(day, 0))}
        for day in WEEKDAYS
    ]

    lag_days = (df["posted"] - df["txn_date"]).dt.days

    dup_key = ["transaction_date", "vendor_n", "amount", "cardholder"]
    potential_dupes = int(df.duplicated(dup_key, keep=False).sum())

    cardholder_totals = df.groupby("cardholder")["amount"].sum()
    vendor_totals = df.groupby("vendor_n")["amount"].sum()

    largest = df.nlargest(10, "amount")
    largest_credits = df.nsmallest(5, "amount")

    def txn_rows(frame: pd.DataFrame) -> list[dict]:
        return [
            {
                "date": row["transaction_date"],
                "amount": money(row["amount"]),
                "vendor": row["vendor_n"],
                "cardholder": row["cardholder"],
                "description": row["description"],
            }
            for _, row in frame.iterrows()
        ]

    return {
        "source": {
            "file": csv_path.name,
            "period": f"{df['txn_date'].min():%b %d, %Y} to {df['txn_date'].max():%b %d, %Y}",
        },
        "totals": {
            "net": money(total_net),
            "gross_purchases": money(purchases["amount"].sum()),
            "credits": money(credits["amount"].sum()),
            "transactions": int(len(df)),
            "credit_transactions": int(len(credits)),
            "cardholders": int(df["cardholder"].nunique()),
            "vendors": int(df["vendor_n"].nunique()),
            "merchant_categories": int(df["mcc_n"].nunique()),
            "average_transaction": money(df["amount"].mean()),
            "median_transaction": money(df["amount"].median()),
        },
        "monthly": monthly,
        "peak_month": {"month": peak["month"], "net": peak["net"]},
        "low_month": {"month": low["month"], "net": low["net"]},
        "top_categories": group_top(df, "mcc_n"),
        "top_vendors": group_top(df, "vendor_n"),
        "top_cardholders": group_top(df, "cardholder"),
        "concentration": {
            "top10_cardholder_share": round(
                cardholder_totals.nlargest(10).sum() / total_net * 100, 1),
            "top10_vendor_share": round(
                vendor_totals.nlargest(10).sum() / total_net * 100, 1),
        },
        "travel": [
            {"type": row["description_n"], "net": money(row["net"]),
             "count": int(row["count"])}
            for _, row in travel_by_type.iterrows()
        ],
        "weekday": weekday,
        "posting": {
            "median_lag_days": float(lag_days.median()),
            "within_two_days_share": round(float((lag_days <= 2).mean() * 100), 1),
        },
        "data_quality": {
            "potential_duplicate_rows": potential_dupes,
            "duplicate_rule": "same date, vendor, amount and cardholder",
            "general_purchase_share": round(
                (df["description_n"] == "general purchase").mean() * 100, 1),
        },
        "largest_transactions": txn_rows(largest),
        "largest_credits": txn_rows(largest_credits),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path, help="Path to the PCard CSV export")
    parser.add_argument("--out", type=Path, default=Path("site/data/summary.json"))
    args = parser.parse_args()

    summary = build(args.csv)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out} ({summary['totals']['transactions']} transactions)")


if __name__ == "__main__":
    main()
