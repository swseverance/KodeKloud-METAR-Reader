'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function degreesToCompass(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function celsiusToFahrenheit(c) {
  return Math.round(c * 9 / 5 + 32);
}

function knotsToMph(kt) {
  return Math.round(kt * 1.15078);
}

function parseSignedTemp(str) {
  // M01 => -1, 19 => 19
  return str.startsWith('M') ? -parseInt(str.slice(1)) : parseInt(str);
}

// ---------------------------------------------------------------------------
// Weather phenomena decoder
// ---------------------------------------------------------------------------

const WX_INTENSITY = { '-': 'Light', '+': 'Heavy', VC: 'In the vicinity:' };
const WX_DESCRIPTOR = {
  MI: 'shallow', PR: 'partial', BC: 'patches of', DR: 'drifting',
  BL: 'blowing', SH: 'showers', TS: 'thunderstorm with', FZ: 'freezing',
};
const WX_PHENOMENON = {
  DZ: 'drizzle', RA: 'rain', SN: 'snow', SG: 'snow grains',
  IC: 'ice crystals', PL: 'ice pellets', GR: 'hail', GS: 'small hail',
  UP: 'unknown precipitation', BR: 'mist', FG: 'fog', FU: 'smoke',
  VA: 'volcanic ash', DU: 'dust', SA: 'sand', HZ: 'haze', PY: 'spray',
  PO: 'dust devils', SQ: 'squalls', FC: 'tornado / waterspout',
  SS: 'sandstorm', DS: 'dust storm',
};

function decodeWeatherToken(token) {
  let rest = token;
  let intensity = 'Moderate';
  let prefix = '';

  if (rest.startsWith('VC')) {
    prefix = 'In the vicinity: ';
    rest = rest.slice(2);
  } else if (rest.startsWith('+')) {
    intensity = 'Heavy';
    rest = rest.slice(1);
  } else if (rest.startsWith('-')) {
    intensity = 'Light';
    rest = rest.slice(1);
  }

  const parts = [];

  // Descriptor (2-letter prefix)
  for (const [code, text] of Object.entries(WX_DESCRIPTOR)) {
    if (rest.startsWith(code)) {
      parts.push(text);
      rest = rest.slice(2);
      break;
    }
  }

  // Phenomenon(a) — may be multiple 2-letter codes
  while (rest.length >= 2) {
    const code = rest.slice(0, 2);
    if (WX_PHENOMENON[code]) {
      parts.push(WX_PHENOMENON[code]);
      rest = rest.slice(2);
    } else {
      break;
    }
  }

  if (parts.length === 0) return token; // unrecognised, return raw

  const phenom = parts.join(' ');
  if (intensity === 'Moderate') return prefix + capitalize(phenom);
  return prefix + intensity + ' ' + phenom;
}

// ---------------------------------------------------------------------------
// Sky cover decoder
// ---------------------------------------------------------------------------

const COVER_TEXT = {
  SKC: 'Clear skies', CLR: 'Clear skies', NSC: 'No significant cloud',
  NCD: 'No cloud detected',
  FEW: 'Few clouds',   // 1–2 oktas
  SCT: 'Scattered clouds', // 3–4 oktas
  BKN: 'Broken clouds',    // 5–7 oktas
  OVC: 'Overcast',         // 8 oktas
  VV:  'Vertical visibility (sky obscured)',
};

function formatCloudLayer(cover, heightCode, cloudType) {
  const base = COVER_TEXT[cover] || cover;
  if (heightCode == null) return base;
  const ft = parseInt(heightCode) * 100;
  const extra = cloudType === 'CB' ? ' (cumulonimbus)' : cloudType === 'TCU' ? ' (towering cumulus)' : '';
  return `${base} at ${ft.toLocaleString()} ft${extra}`;
}

// ---------------------------------------------------------------------------
// Flight category
// ---------------------------------------------------------------------------

function flightCategory(clouds, visibilityMiles) {
  // Determine ceiling: lowest BKN or OVC layer
  let ceilingFt = Infinity;
  for (const layer of clouds) {
    if ((layer.cover === 'BKN' || layer.cover === 'OVC') && layer.heightFt !== null) {
      ceilingFt = Math.min(ceilingFt, layer.heightFt);
    }
  }

  const vis = typeof visibilityMiles === 'number' ? visibilityMiles : 10;

  if (ceilingFt < 500 || vis < 1)       return 'LIFR';
  if (ceilingFt < 1000 || vis < 3)      return 'IFR';
  if (ceilingFt <= 3000 || vis <= 5)    return 'MVFR';
  return 'VFR';
}

const CATEGORY_DESCRIPTION = {
  VFR:  'Visual Flight Rules — clear flying conditions',
  MVFR: 'Marginal VFR — reduced visibility or low ceilings',
  IFR:  'Instrument Flight Rules — low visibility or clouds',
  LIFR: 'Low IFR — very poor visibility or very low ceiling',
};

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

function parseMetar(raw) {
  const result = {
    raw: raw.trim(),
    station: null,
    time: null,
    auto: false,
    wind: null,
    visibility: null,
    weather: [],
    clouds: [],
    temperature: null,
    dewpoint: null,
    altimeter: null,
    flightCategory: null,
    flightCategoryDescription: null,
    remarks: null,
    summary: null,
  };

  const tokens = raw.trim().split(/\s+/);
  let i = 0;

  // --- Strip optional "METAR" / "SPECI" report-type prefix ---
  if (tokens[i] === 'METAR' || tokens[i] === 'SPECI') i++;

  // --- Station identifier ---
  result.station = tokens[i++];

  // --- Date/time: DDHHmmZ ---
  if (i < tokens.length && /^\d{6}Z$/.test(tokens[i])) {
    const t = tokens[i++];
    result.time = {
      day:    parseInt(t.slice(0, 2), 10),
      hour:   parseInt(t.slice(2, 4), 10),
      minute: parseInt(t.slice(4, 6), 10),
    };
  }

  // --- AUTO / COR ---
  if (i < tokens.length && (tokens[i] === 'AUTO' || tokens[i] === 'COR')) {
    if (tokens[i] === 'AUTO') result.auto = true;
    i++;
  }

  // --- Wind: dddssKT, dddssGggKT, VRBssKT, 00000KT ---
  if (i < tokens.length && /^(VRB|\d{3})\d{2,3}(G\d{2,3})?(KT|MPS|KMH)$/.test(tokens[i])) {
    const m = tokens[i++].match(/^(VRB|\d{3})(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/);
    const dirRaw = m[1];
    const spdRaw = parseInt(m[2], 10);
    const gustRaw = m[4] ? parseInt(m[4], 10) : null;
    const unit = m[5];

    const toMph = unit === 'KT' ? knotsToMph
                : unit === 'MPS' ? (v) => Math.round(v * 2.23694)
                : (v) => Math.round(v * 0.621371); // KMH

    const calm = spdRaw === 0 && dirRaw === '000';
    const dirDeg = dirRaw === 'VRB' ? null : parseInt(dirRaw, 10);

    result.wind = {
      calm,
      variable: dirRaw === 'VRB',
      directionDeg: dirDeg,
      directionCompass: dirDeg !== null ? degreesToCompass(dirDeg) : 'variable',
      speedKt: unit === 'KT' ? spdRaw : null,
      speedMph: toMph(spdRaw),
      gustMph: gustRaw !== null ? toMph(gustRaw) : null,
    };

    // Variable wind range: dddVddd
    if (i < tokens.length && /^\d{3}V\d{3}$/.test(tokens[i])) {
      const [from, to] = tokens[i++].split('V').map(Number);
      result.wind.variableFrom = degreesToCompass(from);
      result.wind.variableTo = degreesToCompass(to);
    }
  }

  // --- Visibility ---
  if (i < tokens.length) {
    if (tokens[i] === 'CAVOK') {
      result.visibility = { miles: 10, text: '10+ miles', cavok: true };
      i++;
    } else if (/^M?\d+(\/\d+)?SM$/.test(tokens[i])) {
      const raw = tokens[i++];
      const lessThan = raw.startsWith('M');
      const numStr = raw.replace(/^M/, '').replace('SM', '');
      let miles;
      if (numStr.includes('/')) {
        const [n, d] = numStr.split('/');
        miles = parseInt(n, 10) / parseInt(d, 10);
      } else {
        miles = parseInt(numStr, 10);
      }
      result.visibility = {
        miles: lessThan ? miles : miles,
        lessThan,
        text: lessThan ? `Less than ${miles} mile${miles !== 1 ? 's' : ''}`
                       : miles >= 10 ? '10 miles or more'
                       : `${miles} mile${miles !== 1 ? 's' : ''}`,
      };
    } else if (/^\d+$/.test(tokens[i]) && i + 1 < tokens.length && /^\d+\/\d+SM$/.test(tokens[i + 1])) {
      // "1 1/2SM" style
      const whole = parseInt(tokens[i++], 10);
      const [n, d] = tokens[i++].replace('SM', '').split('/');
      const miles = whole + parseInt(n, 10) / parseInt(d, 10);
      result.visibility = { miles, text: `${miles} miles` };
    } else if (/^\d{4}$/.test(tokens[i])) {
      // Metric (meters)
      const meters = parseInt(tokens[i++], 10);
      const miles = Math.round((meters / 1609.34) * 10) / 10;
      result.visibility = { miles, meters, text: `${meters} m (${miles} mi)` };
    }
  }

  // --- Weather phenomena ---
  const WX_RE = /^(VC|[-+])?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/;
  while (i < tokens.length && WX_RE.test(tokens[i])) {
    result.weather.push(decodeWeatherToken(tokens[i++]));
  }

  // --- Sky conditions ---
  const SKY_RE = /^(SKC|CLR|NSC|NCD|FEW|SCT|BKN|OVC|VV)(\d{3})?(CB|TCU)?$/;
  while (i < tokens.length && SKY_RE.test(tokens[i])) {
    const m = tokens[i++].match(SKY_RE);
    const cover = m[1];
    const heightFt = m[2] != null ? parseInt(m[2], 10) * 100 : null;
    result.clouds.push({
      cover,
      heightFt,
      cloudType: m[3] || null,
      text: formatCloudLayer(cover, m[2], m[3]),
    });
  }

  // --- Temperature / Dewpoint: TT/DD ---
  if (i < tokens.length && /^M?\d{2}\/M?\d{2}$/.test(tokens[i])) {
    const [tStr, dStr] = tokens[i++].split('/');
    const tempC = parseSignedTemp(tStr);
    const dewC  = parseSignedTemp(dStr);
    result.temperature = { c: tempC, f: celsiusToFahrenheit(tempC) };
    result.dewpoint    = { c: dewC,  f: celsiusToFahrenheit(dewC) };
  }

  // --- Altimeter: Annnn (inHg) or Qnnnn (hPa) ---
  if (i < tokens.length && /^[AQ]\d{4}$/.test(tokens[i])) {
    const alt = tokens[i++];
    if (alt.startsWith('A')) {
      const inHg = parseInt(alt.slice(1), 10) / 100;
      result.altimeter = { inHg, hPa: Math.round(inHg * 33.8639) };
    } else {
      const hPa = parseInt(alt.slice(1), 10);
      result.altimeter = { inHg: Math.round(hPa / 33.8639 * 100) / 100, hPa };
    }
  }

  // --- Remarks ---
  if (i < tokens.length && tokens[i] === 'RMK') {
    result.remarks = tokens.slice(i + 1).join(' ');
  }

  // --- Flight category ---
  result.flightCategory = flightCategory(result.clouds, result.visibility?.miles);
  result.flightCategoryDescription = CATEGORY_DESCRIPTION[result.flightCategory];

  // --- Plain-English summary ---
  result.summary = buildSummary(result);

  return result;
}

// ---------------------------------------------------------------------------
// Plain-English summary
// ---------------------------------------------------------------------------

function buildSummary(r) {
  const sentences = [];

  // Sky / overall condition
  if (r.weather.length > 0) {
    sentences.push(r.weather.join('. ') + '.');
  }

  const sky = r.clouds[0];
  if (sky) {
    if (sky.cover === 'SKC' || sky.cover === 'CLR' || sky.cover === 'NSC') {
      sentences.push('Skies are clear.');
    } else if (r.clouds.length === 1) {
      sentences.push(`${sky.text}.`);
    } else {
      const layers = r.clouds.map(c => c.text).join('; ');
      sentences.push(`Cloud layers: ${layers}.`);
    }
  }

  // Temperature
  if (r.temperature) {
    const t = r.temperature;
    const d = r.dewpoint;
    let tempSentence = `Temperature is ${t.f}°F (${t.c}°C)`;
    if (d) {
      const humidity = relativeHumidity(t.c, d.c);
      tempSentence += `, dewpoint ${d.f}°F (${d.c}°C), humidity around ${humidity}%`;
    }
    sentences.push(tempSentence + '.');
  }

  // Wind
  if (r.wind) {
    if (r.wind.calm) {
      sentences.push('Winds are calm.');
    } else if (r.wind.variable) {
      let w = `Winds are variable at ${r.wind.speedMph} mph`;
      if (r.wind.gustMph) w += `, gusting to ${r.wind.gustMph} mph`;
      sentences.push(w + '.');
    } else {
      let w = `Winds from the ${r.wind.directionCompass} at ${r.wind.speedMph} mph`;
      if (r.wind.gustMph) w += `, gusting to ${r.wind.gustMph} mph`;
      if (r.wind.variableFrom) w += ` (variable ${r.wind.variableFrom}–${r.wind.variableTo})`;
      sentences.push(w + '.');
    }
  }

  // Visibility
  if (r.visibility) {
    sentences.push(`Visibility is ${r.visibility.text}.`);
  }

  // Pressure
  if (r.altimeter) {
    sentences.push(`Altimeter setting ${r.altimeter.inHg.toFixed(2)} inHg (${r.altimeter.hPa} hPa).`);
  }

  return sentences.join(' ');
}

// Approximate relative humidity from temp & dewpoint (Magnus formula)
function relativeHumidity(tempC, dewC) {
  const a = 17.625, b = 243.04;
  const rh = 100 * Math.exp((a * dewC) / (b + dewC)) / Math.exp((a * tempC) / (b + tempC));
  return Math.round(rh);
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { parseMetar };
