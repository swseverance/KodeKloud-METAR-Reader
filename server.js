'use strict';

const express = require('express');
const path = require('path');
const { parseMetar } = require('./src/metar-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const METAR_API = 'https://aviationweather.gov/api/data/metar?ids=';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/metar', async (req, res) => {
  const id = (req.query.id || '').trim().toUpperCase();

  if (!id || !/^[A-Z0-9]{3,4}$/.test(id)) {
    return res.status(400).json({ error: 'Please provide a valid 3–4 character airport code.' });
  }

  try {
    const response = await fetch(`${METAR_API}${id}`);

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to reach the weather service. Try again.' });
    }

    const text = (await response.text()).trim();

    if (!text || text.length === 0) {
      return res.status(404).json({ error: `No METAR data found for "${id}". Check the airport code and try again.` });
    }

    // The API may return multiple lines; use the first non-empty line
    const rawMetar = text.split('\n').find(l => l.trim().length > 0);

    if (!rawMetar) {
      return res.status(404).json({ error: `No METAR data found for "${id}".` });
    }

    const parsed = parseMetar(rawMetar);
    res.json(parsed);
  } catch (err) {
    console.error('METAR fetch error:', err.message);
    res.status(502).json({ error: 'Unable to reach the weather service. Check your internet connection.' });
  }
});

app.listen(PORT, () => {
  console.log(`METAR Reader running at http://localhost:${PORT}`);
});
