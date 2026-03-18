'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_WEEKLY_HOURS,
  roundToTwoDecimals,
  sanitizeWeeklyHours,
  deriveStandardDayHoursFromWeekly,
  deriveFourDayWeekHoursFromWeekly,
  deriveNineDayFortnightHoursFromWeekly,
  normalizeThemeChoice,
  getScrollPaddingOffset,
} = require('../assets/js/utils.js');

test('roundToTwoDecimals rounds valid values and guards invalid input', () => {
  assert.equal(roundToTwoDecimals(1.236), 1.24);
  assert.equal(roundToTwoDecimals('4.234'), 4.23);
  assert.equal(roundToTwoDecimals('nope'), 0);
});

test('sanitizeWeeklyHours uses defaults for invalid values', () => {
  assert.equal(sanitizeWeeklyHours(40), 40);
  assert.equal(sanitizeWeeklyHours('37.5'), 37.5);
  assert.equal(sanitizeWeeklyHours(0), DEFAULT_WEEKLY_HOURS);
  assert.equal(sanitizeWeeklyHours(-4), DEFAULT_WEEKLY_HOURS);
  assert.equal(sanitizeWeeklyHours('invalid'), DEFAULT_WEEKLY_HOURS);
});

test('weekly conversion helpers return rounded values', () => {
  assert.equal(deriveStandardDayHoursFromWeekly(37), 7.4);
  assert.equal(deriveFourDayWeekHoursFromWeekly(37), 9.25);
  assert.equal(deriveNineDayFortnightHoursFromWeekly(37), 8.22);
});

test('weekly conversion helpers fallback when hours are invalid', () => {
  assert.equal(deriveStandardDayHoursFromWeekly(undefined), 7.4);
  assert.equal(deriveFourDayWeekHoursFromWeekly(null), 9.25);
  assert.equal(deriveNineDayFortnightHoursFromWeekly('oops'), 8.22);
});

test('normalizeThemeChoice accepts known themes only', () => {
  assert.equal(normalizeThemeChoice('default'), 'default');
  assert.equal(normalizeThemeChoice('inverted'), 'inverted');
  assert.equal(normalizeThemeChoice('glass'), 'glass');
  assert.equal(normalizeThemeChoice('retro'), 'default');
  assert.equal(normalizeThemeChoice(''), 'default');
});

test('getScrollPaddingOffset returns a safe numeric offset', () => {
  assert.equal(getScrollPaddingOffset({ mobileHeaderOffset: '88px' }), 104);
  assert.equal(getScrollPaddingOffset({ mobileHeaderOffset: -8, extraOffset: 12 }), 12);
  assert.equal(getScrollPaddingOffset({ mobileHeaderOffset: 'auto', extraOffset: 8 }), 8);
  assert.equal(getScrollPaddingOffset(), 16);
});
