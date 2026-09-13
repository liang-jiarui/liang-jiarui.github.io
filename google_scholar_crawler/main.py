#!/usr/bin/env python3
"""Fetch Google Scholar citation totals, h-index, and per-paper counts."""

import json
import os
import re
import urllib.request
from datetime import datetime, timezone

SCHOLAR_ID = os.environ.get("GOOGLE_SCHOLAR_ID", "AJl9nB4AAAAJ")
URL = (
    f"https://scholar.google.com/citations?user={SCHOLAR_ID}"
    "&hl=en&cstart=0&pagesize=80"
)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}


def fetch_html(url: str) -> str:
    try:
        import requests

        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        return response.text
    except ImportError:
        request = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8", "replace")


def parse_papers(html):
    papers = []
    for row in re.findall(r'<tr class="gsc_a_tr">(.*?)</tr>', html, re.S):
        title_match = re.search(r'class="gsc_a_at"[^>]*>(.*?)</a>', row, re.S)
        if not title_match:
            continue
        cite_match = re.search(r'class="gsc_a_ac[^"]*"[^>]*>(.*?)</a>', row, re.S)
        year_match = re.search(r'class="gsc_a_h gsc_a_hc gs_ibl">(\d+)</span>', row)
        cite_digits = re.search(r"(\d+)", cite_match.group(1) if cite_match else "")
        papers.append(
            {
                "title": re.sub(r"<[^>]+>", "", title_match.group(1)).strip(),
                "citedby": int(cite_digits.group(1)) if cite_digits else 0,
                "year": int(year_match.group(1)) if year_match else None,
            }
        )
    return papers


def parse_stats(html: str) -> dict:
    citedby = None
    meta = re.search(r"Cited by\s+(\d+)", html)
    if meta:
        citedby = int(meta.group(1))

    cells = [int(n) for n in re.findall(r'class="gsc_rsb_std">(\d+)', html)]
    if cells:
        citedby = cells[0]

    hindex = cells[2] if len(cells) >= 3 else None
    if citedby is None:
        raise RuntimeError("Could not parse citation count from Google Scholar HTML")

    papers = parse_papers(html)

    return {
        "citedby": citedby,
        "hindex": hindex,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "scholar_id": SCHOLAR_ID,
        "papers": papers,
    }


def main() -> None:
    data = parse_stats(fetch_html(URL))
    os.makedirs("results", exist_ok=True)
    with open("results/gs_data.json", "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False)
    with open("results/gs_data_shieldsio.json", "w", encoding="utf-8") as handle:
        json.dump(
            {"schemaVersion": 1, "label": "citations", "message": str(data["citedby"])},
            handle,
        )
    print(json.dumps(data, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
