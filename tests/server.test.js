'use strict';

const request = require('supertest');
const app = require('../server');

// ---------------------------------------------------------------------------
// Mock global fetch so tests never hit the real API
// ---------------------------------------------------------------------------

const SAMPLE_METAR = 'METAR KHIO 131553Z 00000KT 10SM CLR 19/07 A2992 RMK AO2';

function mockFetchSuccess(body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(body),
  });
}

function mockFetchNotOk() {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
}

function mockFetchNetworkError() {
  global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('GET /api/metar — input validation', () => {
  test('returns 400 when id is missing', async () => {
    const res = await request(app).get('/api/metar');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid.*airport code/i);
  });

  test('returns 400 when id is an empty string', async () => {
    const res = await request(app).get('/api/metar?id=');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid.*airport code/i);
  });

  test('returns 400 when id contains special characters', async () => {
    const res = await request(app).get('/api/metar?id=KH!O');
    expect(res.status).toBe(400);
  });

  test('returns 400 when id is longer than 4 characters', async () => {
    const res = await request(app).get('/api/metar?id=KHIOXX');
    expect(res.status).toBe(400);
  });

  test('returns 400 when id is only 2 characters', async () => {
    const res = await request(app).get('/api/metar?id=KH');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Successful response
// ---------------------------------------------------------------------------

describe('GET /api/metar — successful response', () => {
  beforeEach(() => mockFetchSuccess(SAMPLE_METAR));

  test('returns 200 for a valid 4-letter code', async () => {
    const res = await request(app).get('/api/metar?id=KHIO');
    expect(res.status).toBe(200);
  });

  test('returns 200 for a valid 3-letter code', async () => {
    const res = await request(app).get('/api/metar?id=HIO');
    expect(res.status).toBe(200);
  });

  test('response includes station identifier', async () => {
    const res = await request(app).get('/api/metar?id=KHIO');
    expect(res.body.station).toBe('KHIO');
  });

  test('response includes raw METAR string', async () => {
    const res = await request(app).get('/api/metar?id=KHIO');
    expect(res.body.raw).toBe(SAMPLE_METAR.trim());
  });

  test('response includes flight category', async () => {
    const res = await request(app).get('/api/metar?id=KHIO');
    expect(['VFR', 'MVFR', 'IFR', 'LIFR']).toContain(res.body.flightCategory);
  });

  test('response includes plain-English summary', async () => {
    const res = await request(app).get('/api/metar?id=KHIO');
    expect(typeof res.body.summary).toBe('string');
    expect(res.body.summary.length).toBeGreaterThan(0);
  });

  test('airport code is normalised to uppercase', async () => {
    const res = await request(app).get('/api/metar?id=khio');
    expect(res.status).toBe(200);
    // fetch should have been called with uppercase code
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('KHIO'));
  });

  test('uses first non-empty line when API returns multiple lines', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('\n' + SAMPLE_METAR + '\nsome other line'),
    });
    const res = await request(app).get('/api/metar?id=KHIO');
    expect(res.status).toBe(200);
    expect(res.body.station).toBe('KHIO');
  });
});

// ---------------------------------------------------------------------------
// Upstream API errors
// ---------------------------------------------------------------------------

describe('GET /api/metar — upstream errors', () => {
  test('returns 404 when API returns empty body', async () => {
    mockFetchSuccess('');
    const res = await request(app).get('/api/metar?id=ZZZZ');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no metar data/i);
  });

  test('returns 404 when API returns only whitespace', async () => {
    mockFetchSuccess('   \n  ');
    const res = await request(app).get('/api/metar?id=ZZZZ');
    expect(res.status).toBe(404);
  });

  test('returns 502 when upstream responds with non-ok status', async () => {
    mockFetchNotOk();
    const res = await request(app).get('/api/metar?id=KHIO');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/weather service/i);
  });

  test('returns 502 on network failure', async () => {
    mockFetchNetworkError();
    const res = await request(app).get('/api/metar?id=KHIO');
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/weather service/i);
  });
});

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

describe('static file serving', () => {
  test('GET / serves index.html', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});
