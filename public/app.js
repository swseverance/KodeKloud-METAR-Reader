'use strict';

const form      = document.getElementById('search-form');
const input     = document.getElementById('airport-input');
const errorBanner = document.getElementById('error-banner');
const resultSection = document.getElementById('result');
const submitBtn = form.querySelector('button[type="submit"]');

// ── Helpers ──────────────────────────────────────────────────────────────────

function show(el)  { el.classList.remove('hidden'); }
function hide(el)  { el.classList.add('hidden'); }
function text(id, value) { document.getElementById(id).textContent = value; }
function html(id, value) { document.getElementById(id).innerHTML   = value; }

function showError(msg) {
  errorBanner.textContent = msg;
  show(errorBanner);
  hide(resultSection);
}

function setLoading(on) {
  if (on) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Loading…';
  } else {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Get Weather';
  }
}

function formatTime(time) {
  if (!time) return '';
  const h = String(time.hour).padStart(2, '0');
  const m = String(time.minute).padStart(2, '0');
  return `Report time: ${h}:${m} UTC (day ${time.day})`;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(data) {
  hide(errorBanner);

  // Station + time + badge
  text('station-code', data.station || '—');
  text('report-time', formatTime(data.time));

  const badge = document.getElementById('flight-badge');
  badge.textContent = data.flightCategory || '';
  badge.className = `flight-badge ${data.flightCategory || ''}`;
  badge.title = data.flightCategoryDescription || '';

  // Plain-English summary
  text('summary', data.summary || 'No summary available.');

  // Temperature
  if (data.temperature) {
    text('val-temp', `${data.temperature.f}°F / ${data.temperature.c}°C`);
    text('val-dew', data.dewpoint
      ? `Dewpoint ${data.dewpoint.f}°F (${data.dewpoint.c}°C)`
      : '');
  } else {
    text('val-temp', '—');
    text('val-dew', '');
  }

  // Wind
  if (data.wind) {
    if (data.wind.calm) {
      text('val-wind', 'Calm');
      text('val-gust', '');
    } else if (data.wind.variable) {
      text('val-wind', `Variable ${data.wind.speedMph} mph`);
      text('val-gust', data.wind.gustMph ? `Gusting ${data.wind.gustMph} mph` : '');
    } else {
      const dir = data.wind.directionCompass.toUpperCase();
      const deg = data.wind.directionDeg !== null ? ` (${data.wind.directionDeg}°)` : '';
      text('val-wind', `${dir}${deg}  ${data.wind.speedMph} mph`);
      let gustLine = data.wind.gustMph ? `Gusting ${data.wind.gustMph} mph` : '';
      if (data.wind.variableFrom) {
        gustLine += (gustLine ? ' · ' : '') + `Variable ${data.wind.variableFrom}–${data.wind.variableTo}`;
      }
      text('val-gust', gustLine);
    }
  } else {
    text('val-wind', '—');
    text('val-gust', '');
  }

  // Visibility
  text('val-vis', data.visibility ? data.visibility.text : '—');

  // Sky conditions
  const skyEl = document.getElementById('val-sky');
  if (data.clouds && data.clouds.length > 0) {
    skyEl.innerHTML = data.clouds
      .map(c => `<div class="sky-layer">${escHtml(c.text)}</div>`)
      .join('');
  } else {
    skyEl.innerHTML = '<div class="sky-layer">No cloud data</div>';
  }

  // Present weather
  const wxEl = document.getElementById('val-wx');
  if (data.weather && data.weather.length > 0) {
    wxEl.innerHTML = data.weather
      .map(w => `<div class="wx-item">${escHtml(w)}</div>`)
      .join('');
  } else {
    wxEl.innerHTML = '<div class="wx-item" style="color:var(--muted)">None reported</div>';
  }

  // Pressure
  if (data.altimeter) {
    text('val-pressure', `${data.altimeter.inHg.toFixed(2)} inHg / ${data.altimeter.hPa} hPa`);
  } else {
    text('val-pressure', '—');
  }

  // Raw METAR
  text('raw-metar', data.raw || '');

  show(resultSection);
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Form submit ───────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = input.value.trim().toUpperCase();
  if (!id) {
    input.focus();
    return;
  }

  setLoading(true);
  hide(errorBanner);

  try {
    const res = await fetch(`/api/metar?id=${encodeURIComponent(id)}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Something went wrong. Please try again.');
      return;
    }

    render(data);
  } catch {
    showError('Network error — could not reach the server. Please try again.');
  } finally {
    setLoading(false);
  }
});

// Allow pressing Enter naturally (already handled by form submit)
// Auto-uppercase as you type
input.addEventListener('input', () => {
  const pos = input.selectionStart;
  input.value = input.value.toUpperCase();
  input.setSelectionRange(pos, pos);
});
