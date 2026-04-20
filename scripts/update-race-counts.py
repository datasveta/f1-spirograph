#!/usr/bin/env python3
"""
Fetches race counts per circuit from Wikipedia's "List of Formula One circuits" page
and updates the `races:` values in index.html.

Usage:
    python3 scripts/update-race-counts.py
"""

import re
import urllib.request

# Map circuit names as they appear in the Wikipedia wikitext → JS field name to update.
# Keys are substrings to match in the wikitext row; values are the circuit titles in index.html.
CIRCUIT_MAP = {
    "Albert Park":              "Australian GP",
    "Shanghai":                 "Chinese GP",
    "Suzuka":                   "Japanese GP",
    "Miami International":      "Miami GP",
    "Gilles Villeneuve":        "Canadian GP",
    "Circuit de Monaco":        "Monaco GP",
    "Barcelona-Catalunya":      "Spanish GP",
    "Red Bull Ring":            "Austrian GP",
    "Silverstone":              "British GP",
    "Spa-Francorchamps":        "Belgian GP",
    "Hungaroring":              "Hungarian GP",
    "Zandvoort":                "Dutch GP",
    "Monza":                    "Italian GP",
    "Madring":                  "Madrid GP",
    "Baku City":                "Azerbaijan GP",
    "Marina Bay":               "Singapore GP",
    "Circuit of the Americas":  "United States GP",
    "Hermanos Rodríguez":       "Mexico City GP",
    "José Carlos Pace":         "São Paulo GP",
    "Las Vegas":                "Las Vegas GP",
    "Lusail":                   "Qatar GP",
    "Yas Marina":               "Abu Dhabi GP",
}

WIKI_URL = "https://en.wikipedia.org/w/index.php?title=List_of_Formula_One_circuits&action=raw"
INDEX_HTML = "index.html"


def fetch_wikitext():
    req = urllib.request.Request(WIKI_URL, headers={"User-Agent": "F1SpiographBot/1.0"})
    with urllib.request.urlopen(req) as r:
        return r.read().decode("utf-8")


def extract_counts(wikitext):
    """Parse wikitext table rows and extract the last number (race count) per row."""
    counts = {}
    # Each row block ends with a number like "|| 75\n" or "|| 75 \n"
    rows = wikitext.split("|-")
    for row in rows:
        for keyword, gp_title in CIRCUIT_MAP.items():
            if keyword in row:
                # The count is the last integer on a line starting with ||
                numbers = re.findall(r"\|\|\s*(\d+)\s*\n", row)
                if numbers:
                    counts[gp_title] = int(numbers[-1])
                break
    return counts


def update_index(counts):
    with open(INDEX_HTML, "r", encoding="utf-8") as f:
        html = f.read()

    for gp_title, count in counts.items():
        # Match line like:   { title: 'Australian GP', ... races:  29 },
        pattern = rf"(title:\s*'{re.escape(gp_title)}'.*?races:\s*)(\d+)"
        replacement = rf"\g<1>{count}"
        html, n = re.subn(pattern, replacement, html, flags=re.DOTALL)
        status = f"→ {count}" if n else "NOT FOUND in HTML"
        print(f"  {gp_title:25s} {status}")

    with open(INDEX_HTML, "w", encoding="utf-8") as f:
        f.write(html)


if __name__ == "__main__":
    print("Fetching Wikipedia wikitext…")
    wikitext = fetch_wikitext()
    print("Parsing race counts…")
    counts = extract_counts(wikitext)
    print(f"Found {len(counts)}/{len(CIRCUIT_MAP)} circuits. Updating {INDEX_HTML}…")
    update_index(counts)
    print("Done.")
