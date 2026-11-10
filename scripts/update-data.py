#!/usr/bin/env python3
"""
Fetches race winners per circuit from the Jolpica F1 API (Ergast successor)
and writes data/circuits.json, which index.html loads at runtime.

Usage (from repo root):
    python3 scripts/update-data.py
"""

import json
import sys
import time
import urllib.error
import urllib.request

API = "https://api.jolpi.ca/ergast/f1/circuits/{cid}/results/1.json?limit=100"
OUT = "data/circuits.json"

# Titles as used in index.html → Jolpica circuitId.
CIRCUIT_IDS = {
    "Australian GP":    "albert_park",
    "Chinese GP":       "shanghai",
    "Japanese GP":      "suzuka",
    "Miami GP":         "miami",
    "Canadian GP":      "villeneuve",
    "Monaco GP":        "monaco",
    "Spanish GP":       "catalunya",
    "Austrian GP":      "red_bull_ring",
    "British GP":       "silverstone",
    "Belgian GP":       "spa",
    "Hungarian GP":     "hungaroring",
    "Dutch GP":         "zandvoort",
    "Italian GP":       "monza",
    "Madrid GP":        "madring",
    "Azerbaijan GP":    "baku",
    "Singapore GP":     "marina_bay",
    "United States GP": "americas",
    "Mexico City GP":   "rodriguez",
    "São Paulo GP":     "interlagos",
    "Las Vegas GP":     "vegas",
    "Qatar GP":         "losail",
    "Abu Dhabi GP":     "yas_marina",
}


def fetch(url, retries=5):
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": "F1SpirographUpdater/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise
        except urllib.error.URLError:
            pass
        time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed to fetch {url}")


def circuit_winners(cid):
    data = fetch(API.format(cid=cid))["MRData"]
    total = int(data["total"])
    winners = []
    for race in data["RaceTable"]["Races"]:
        d = race["Results"][0]["Driver"]
        winners.append({"year": int(race["season"]),
                        "driver": f'{d["givenName"]} {d["familyName"]}'})
    if len(winners) != total:
        raise RuntimeError(f"{cid}: got {len(winners)} of {total} races (pagination?)")
    winners.sort(key=lambda w: -w["year"])
    return winners


def main():
    result = {}
    for title, cid in CIRCUIT_IDS.items():
        winners = circuit_winners(cid)
        result[title] = {"races": len(winners), "winners": winners}
        print(f"  {title:18s} {cid:14s} {len(winners):3d} races")
        time.sleep(0.5)  # stay under the API's burst rate limit

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())
