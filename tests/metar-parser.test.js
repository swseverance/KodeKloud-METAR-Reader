'use strict';

const { parseMetar } = require('../src/metar-parser');

// ---------------------------------------------------------------------------
// Station & time
// ---------------------------------------------------------------------------

describe('station and time', () => {
  test('parses station identifier', () => {
    const result = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(result.station).toBe('KHIO');
  });

  test('strips leading METAR report-type prefix', () => {
    const result = parseMetar('METAR KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(result.station).toBe('KHIO');
  });

  test('strips leading SPECI report-type prefix', () => {
    const result = parseMetar('SPECI KJFK 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(result.station).toBe('KJFK');
  });

  test('parses date and time', () => {
    const result = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(result.time).toEqual({ day: 13, hour: 15, minute: 53 });
  });

  test('marks AUTO reports', () => {
    const result = parseMetar('KHIO 131553Z AUTO 00000KT 10SM CLR 19/07 A2992');
    expect(result.auto).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wind
// ---------------------------------------------------------------------------

describe('wind parsing', () => {
  test('calm winds (00000KT)', () => {
    const { wind } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(wind.calm).toBe(true);
    expect(wind.speedMph).toBe(0);
  });

  test('directional wind with speed in knots', () => {
    const { wind } = parseMetar('KJFK 131851Z 28015KT 10SM CLR 12/05 A2981');
    expect(wind.directionDeg).toBe(280);
    expect(wind.directionCompass).toBe('W');
    expect(wind.speedKt).toBe(15);
    expect(wind.speedMph).toBe(17); // 15 * 1.15078
  });

  test('wind with gusts', () => {
    const { wind } = parseMetar('KJFK 131851Z 28015G25KT 10SM CLR 12/05 A2981');
    expect(wind.speedMph).toBe(17);
    expect(wind.gustMph).toBe(29); // 25 * 1.15078
  });

  test('variable wind direction (VRB)', () => {
    const { wind } = parseMetar('KLAX 131200Z VRB05KT 10SM CLR 20/10 A2990');
    expect(wind.variable).toBe(true);
    expect(wind.directionCompass).toBe('variable');
    expect(wind.speedMph).toBe(6);
  });

  test('variable wind range token (dddVddd)', () => {
    const { wind } = parseMetar('KSFO 131200Z 27010KT 240V310 10SM CLR 15/08 A2995');
    expect(wind.variableFrom).toBe('WSW');
    expect(wind.variableTo).toBe('NW');
  });
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

describe('visibility parsing', () => {
  test('10SM reports as 10 miles or more', () => {
    const { visibility } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(visibility.miles).toBe(10);
    expect(visibility.text).toBe('10 miles or more');
  });

  test('fractional visibility (1/2SM)', () => {
    const { visibility } = parseMetar('KORD 131200Z 00000KT 1/2SM FG OVC002 05/04 A2980');
    expect(visibility.miles).toBeCloseTo(0.5);
  });

  test('whole-mile visibility (3SM)', () => {
    const { visibility } = parseMetar('KATL 131200Z 18010KT 3SM BR BKN010 10/09 A2985');
    expect(visibility.miles).toBe(3);
    expect(visibility.text).toBe('3 miles');
  });

  test('CAVOK sets visibility to 10+ miles', () => {
    const { visibility } = parseMetar('EGLL 131200Z 09010KT CAVOK 18/10 Q1013');
    expect(visibility.cavok).toBe(true);
    expect(visibility.miles).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Weather phenomena
// ---------------------------------------------------------------------------

describe('weather phenomena', () => {
  test('light rain (-RA)', () => {
    const { weather } = parseMetar('KHIO 131953Z 26005KT 10SM -RA OVC048 12/05 A3012');
    expect(weather).toContain('Light rain');
  });

  test('heavy snow (+SN)', () => {
    const { weather } = parseMetar('KDEN 131200Z 36010KT 1SM +SN OVC005 -3/-5 A2960');
    expect(weather).toContain('Heavy snow');
  });

  test('thunderstorm with rain (TSRA)', () => {
    const { weather } = parseMetar('KDFW 131200Z 18015KT 5SM TSRA SCT040CB 28/22 A2985');
    expect(weather[0]).toMatch(/thunderstorm/i);
    expect(weather[0]).toMatch(/rain/i);
  });

  test('fog (FG)', () => {
    const { weather } = parseMetar('KSFO 131200Z 00000KT 1/4SM FG OVC002 12/12 A2990');
    expect(weather).toContain('Fog');
  });

  test('no weather phenomena is an empty array', () => {
    const { weather } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(weather).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Sky conditions
// ---------------------------------------------------------------------------

describe('sky conditions', () => {
  test('CLR reports clear skies', () => {
    const { clouds } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(clouds[0].cover).toBe('CLR');
    expect(clouds[0].text).toBe('Clear skies');
  });

  test('overcast layer with height', () => {
    const { clouds } = parseMetar('KHIO 131953Z 26005KT 10SM -RA OVC048 12/05 A3012');
    expect(clouds[0].cover).toBe('OVC');
    expect(clouds[0].heightFt).toBe(4800);
    expect(clouds[0].text).toBe('Overcast at 4,800 ft');
  });

  test('multiple cloud layers are all captured', () => {
    const { clouds } = parseMetar('KJFK 131951Z 24017KT 10SM BKN110 BKN250 23/13 A2996');
    expect(clouds).toHaveLength(2);
    expect(clouds[0].cover).toBe('BKN');
    expect(clouds[0].heightFt).toBe(11000);
    expect(clouds[1].heightFt).toBe(25000);
  });

  test('cumulonimbus flag on cloud layer (CB)', () => {
    const { clouds } = parseMetar('KDFW 131200Z 18015KT 5SM TSRA SCT040CB 28/22 A2985');
    expect(clouds[0].cloudType).toBe('CB');
    expect(clouds[0].text).toMatch(/cumulonimbus/i);
  });
});

// ---------------------------------------------------------------------------
// Temperature & dewpoint
// ---------------------------------------------------------------------------

describe('temperature and dewpoint', () => {
  test('positive temperature and dewpoint', () => {
    const { temperature, dewpoint } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(temperature).toEqual({ c: 19, f: 66 });
    expect(dewpoint).toEqual({ c: 7, f: 45 });
  });

  test('negative temperature (M prefix)', () => {
    const { temperature } = parseMetar('KDEN 131200Z 36010KT 1SM +SN OVC005 M03/M05 A2960');
    expect(temperature.c).toBe(-3);
    expect(temperature.f).toBe(27);
  });

  test('freezing temperature (00/M02)', () => {
    const { temperature, dewpoint } = parseMetar('KORD 020600Z 00000KT 5SM -SN OVC010 00/M02 A2990');
    expect(temperature.c).toBe(0);
    expect(dewpoint.c).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// Altimeter
// ---------------------------------------------------------------------------

describe('altimeter', () => {
  test('A-format (inches of mercury)', () => {
    const { altimeter } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(altimeter.inHg).toBeCloseTo(29.92, 2);
    expect(altimeter.hPa).toBe(1013);
  });

  test('Q-format (hectopascals)', () => {
    const { altimeter } = parseMetar('EGLL 131200Z 09010KT CAVOK 18/10 Q1013');
    expect(altimeter.hPa).toBe(1013);
    expect(altimeter.inHg).toBeCloseTo(29.92, 1);
  });
});

// ---------------------------------------------------------------------------
// Flight category
// ---------------------------------------------------------------------------

describe('flight category', () => {
  test('VFR — clear skies, good visibility', () => {
    const { flightCategory } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(flightCategory).toBe('VFR');
  });

  test('MVFR — broken ceiling at 2500 ft', () => {
    const { flightCategory } = parseMetar('KBOS 131200Z 18010KT 5SM BKN025 15/10 A2990');
    expect(flightCategory).toBe('MVFR');
  });

  test('IFR — overcast ceiling at 800 ft', () => {
    const { flightCategory } = parseMetar('KSFO 131200Z 00000KT 2SM BR OVC008 12/12 A2990');
    expect(flightCategory).toBe('IFR');
  });

  test('LIFR — overcast at 200 ft, near-zero visibility', () => {
    const { flightCategory } = parseMetar('KORD 131200Z 00000KT 1/4SM FG OVC002 05/04 A2980');
    expect(flightCategory).toBe('LIFR');
  });
});

// ---------------------------------------------------------------------------
// Plain-English summary
// ---------------------------------------------------------------------------

describe('plain-English summary', () => {
  test('summary is a non-empty string', () => {
    const { summary } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });

  test('summary mentions calm winds when 00000KT', () => {
    const { summary } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(summary).toMatch(/calm/i);
  });

  test('summary mentions temperature in fahrenheit', () => {
    const { summary } = parseMetar('KHIO 131553Z 00000KT 10SM CLR 19/07 A2992');
    expect(summary).toMatch(/66°F/);
  });

  test('summary mentions wind direction for directional winds', () => {
    const { summary } = parseMetar('KJFK 131851Z 28015KT 10SM CLR 12/05 A2981');
    expect(summary).toMatch(/W/);
    expect(summary).toMatch(/mph/i);
  });

  test('summary includes active weather phenomena', () => {
    const { summary } = parseMetar('KHIO 131953Z 26005KT 10SM -RA OVC048 12/05 A3012');
    expect(summary).toMatch(/rain/i);
  });
});
