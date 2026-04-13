# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies (Express only)
npm run dev          # start with hot-reload (node --watch, Node ≥ 18)
npm start            # production start

# Test a single METAR fetch+parse via curl (server must be running):
curl "http://localhost:3000/api/metar?id=KHIO"
```

Node 18+ is required (uses built-in `fetch`).

## Architecture

```
server.js              Express server — proxies aviationweather.gov, parses, returns JSON
src/metar-parser.js    Pure METAR → structured JSON + plain-English summary (no deps)
public/
  index.html           Single-page UI
  style.css            Flight-category colour-coded styling (VFR/MVFR/IFR/LIFR)
  app.js               Fetches /api/metar, renders result cards
```

**Data flow:**
1. Browser posts airport code → `GET /api/metar?id=CODE`
2. `server.js` fetches `https://aviationweather.gov/api/data/metar?ids=CODE` (plain text)
3. `parseMetar()` tokenises the raw METAR string left-to-right, extracts each field, then calls `buildSummary()` to produce a plain-English paragraph
4. JSON is returned; `app.js` renders it into cards

**METAR parsing order** (matches the standard token sequence):
`METAR/SPECI prefix` → station → time → AUTO/COR → wind → variable-wind range → visibility → weather phenomena → sky layers → temp/dewpoint → altimeter → remarks

The aviation weather API sometimes prefixes the response with the literal word `METAR` — the parser strips this before reading the station identifier.

**Flight category** is derived from the lowest BKN/OVC ceiling and visibility:
- VFR: ceiling > 3000 ft and vis > 5 mi
- MVFR: ceiling 1000–3000 ft or vis 3–5 mi
- IFR: ceiling 500–999 ft or vis 1–3 mi
- LIFR: ceiling < 500 ft or vis < 1 mi
