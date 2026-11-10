# OSU Purchase Card Analysis (2014)

A static presentation site that summarizes Oklahoma State University purchase card (P-Card) transactions for calendar year 2014.

The site is plain HTML, CSS and JavaScript with no build step. The numbers come from a precomputed summary file, `site/data/summary.json`.

## Repository layout

| Path | Purpose |
| --- | --- |
| `site/` | The website (`index.html`, `styles.css`, `app.js`) and its data |
| `site/data/summary.json` | Aggregated results rendered by the site |
| `scripts/build_summary.py` | Recomputes `summary.json` from the raw CSV export |
| `.github/workflows/pages.yml` | Publishes `site/` to GitHub Pages on pushes to `main` |

The raw CSV (about 15 MB) is not committed. Keep a local copy and pass its path to the script.

## Regenerate the data

Requires Python 3.10+ and pandas.

```bash
pip install pandas
python scripts/build_summary.py path/to/26407c45-PCard-OSU-2014.csv
```

## Preview locally

The page loads `data/summary.json` with `fetch`, so serve the folder over HTTP rather than opening the file directly:

```bash
python -m http.server 8000 --directory site
```

Then open http://localhost:8000.

## Publishing to GitHub Pages

1. In the repository settings, open **Pages** and set **Source** to **GitHub Actions**.
2. Merge changes into `main`. The `Deploy site to GitHub Pages` workflow builds and deploys `site/`.
