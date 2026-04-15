import { describe, expect, test } from 'bun:test';
import { getHouseholdFhscTrades } from './household-fhsc-trades.js';

describe('household_fhsc_trades input schema', () => {
  test('accepts integer limit and coercible numeric string', () => {
    const fromNumber = getHouseholdFhscTrades.schema.parse({ owner_id: 'father', limit: 5 });
    expect(fromNumber.limit).toBe(5);

    const fromString = getHouseholdFhscTrades.schema.parse({ owner_id: 'father', limit: '12' });
    expect(fromString.limit).toBe(12);
  });

  test('rejects non-integer limit', () => {
    expect(() => getHouseholdFhscTrades.schema.parse({ owner_id: 'father', limit: 5.5 })).toThrow();
  });
});
