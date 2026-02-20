import { afterEach, describe, expect, test } from 'bun:test';
import { normalizeApiParams } from './api.js';
import { detectVnPriceProbe, normalizeVnTicker } from './vn-only.js';

const originalVnOnlyMode = process.env.VN_ONLY_MODE;

afterEach(() => {
  if (originalVnOnlyMode === undefined) {
    delete process.env.VN_ONLY_MODE;
  } else {
    process.env.VN_ONLY_MODE = originalVnOnlyMode;
  }
});

describe('normalizeVnTicker', () => {
  test('normalizes common VN ticker variants', () => {
    expect(normalizeVnTicker(' fpt ')).toBe('FPT');
    expect(normalizeVnTicker('FPT.VN')).toBe('FPT');
    expect(normalizeVnTicker('fpt:hose')).toBe('FPT');
    expect(normalizeVnTicker(' acb : hnx ')).toBe('ACB');
    expect(normalizeVnTicker('abc:upcom')).toBe('ABC');
  });
});

describe('normalizeApiParams', () => {
  test('normalizes ticker in VN-only mode', () => {
    process.env.VN_ONLY_MODE = '1';
    const params = normalizeApiParams({ ticker: 'fpt.vn', period: 'ttm' });
    expect(params.ticker).toBe('FPT');
    expect(params.period).toBe('ttm');
  });

  test('normalizes exchange suffix in VN-only mode', () => {
    process.env.VN_ONLY_MODE = '1';
    const params = normalizeApiParams({ ticker: 'vcb:HOSE' });
    expect(params.ticker).toBe('VCB');
  });

  test('keeps ticker untouched when VN-only mode is off', () => {
    delete process.env.VN_ONLY_MODE;
    const params = normalizeApiParams({ ticker: 'fpt.vn' });
    expect(params.ticker).toBe('fpt.vn');
  });
});

describe('detectVnPriceProbe', () => {
  test('detects simple price probe query', () => {
    process.env.VN_ONLY_MODE = '1';
    const probe = detectVnPriceProbe('Giá XXXX');

    expect(probe).not.toBeNull();
    expect(probe?.ticker).toBe('XXXX');
    expect(probe?.isSimplePriceQuery).toBe(true);
  });

  test('detects lowercase ticker in simple price probe query', () => {
    process.env.VN_ONLY_MODE = '1';
    const probe = detectVnPriceProbe('Giá xxxx');

    expect(probe).not.toBeNull();
    expect(probe?.ticker).toBe('XXXX');
    expect(probe?.isSimplePriceQuery).toBe(true);
  });

  test('normalizes .VN suffix in simple probe', () => {
    process.env.VN_ONLY_MODE = '1';
    const probe = detectVnPriceProbe('Giá FPT.VN');

    expect(probe).not.toBeNull();
    expect(probe?.ticker).toBe('FPT');
    expect(probe?.isSimplePriceQuery).toBe(true);
  });

  test('normalizes exchange suffix in simple probe', () => {
    process.env.VN_ONLY_MODE = '1';
    const probe = detectVnPriceProbe('Giá VCB:HOSE');

    expect(probe).not.toBeNull();
    expect(probe?.ticker).toBe('VCB');
    expect(probe?.isSimplePriceQuery).toBe(true);
  });

  test('normalizes lowercase ticker with suffix in simple probe', () => {
    process.env.VN_ONLY_MODE = '1';
    const probe = detectVnPriceProbe('gia fpt.vn');

    expect(probe).not.toBeNull();
    expect(probe?.ticker).toBe('FPT');
    expect(probe?.isSimplePriceQuery).toBe(true);
  });

  test('detects complex price query and keeps ticker', () => {
    process.env.VN_ONLY_MODE = '1';
    const probe = detectVnPriceProbe('Giá FPT 6 tháng + nhận xét trend');

    expect(probe).not.toBeNull();
    expect(probe?.ticker).toBe('FPT');
    expect(probe?.isSimplePriceQuery).toBe(false);
  });

  test('returns null when ticker candidate is ambiguous', () => {
    process.env.VN_ONLY_MODE = '1';
    expect(detectVnPriceProbe('Giá FPT và ACB')).toBeNull();
  });

  test('returns null when VN-only mode is disabled', () => {
    delete process.env.VN_ONLY_MODE;
    expect(detectVnPriceProbe('Giá FPT')).toBeNull();
  });
});
