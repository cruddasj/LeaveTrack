'use strict';

(function initLeaveTrackUtils(globalScope) {
  const DEFAULT_WEEKLY_HOURS = 37;

  function roundToTwoDecimals(value) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100) / 100;
  }

  function sanitizeWeeklyHours(hours) {
    const parsed = Number.parseFloat(hours);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WEEKLY_HOURS;
  }

  function deriveStandardDayHoursFromWeekly(hours) {
    return roundToTwoDecimals(sanitizeWeeklyHours(hours) / 5);
  }

  function deriveFourDayWeekHoursFromWeekly(hours) {
    return roundToTwoDecimals(sanitizeWeeklyHours(hours) / 4);
  }

  function deriveNineDayFortnightHoursFromWeekly(hours) {
    return roundToTwoDecimals((sanitizeWeeklyHours(hours) * 2) / 9);
  }

  function normalizeThemeChoice(choice) {
    if (choice === 'inverted' || choice === 'glass') return choice;
    return 'default';
  }

  function getScrollPaddingOffset(options = {}) {
    const { mobileHeaderOffset = 0, extraOffset = 16 } = options;
    const headerOffset = Number.parseFloat(mobileHeaderOffset);
    const safeHeaderOffset = Number.isFinite(headerOffset) ? Math.max(headerOffset, 0) : 0;
    return safeHeaderOffset + extraOffset;
  }

  const api = {
    DEFAULT_WEEKLY_HOURS,
    roundToTwoDecimals,
    sanitizeWeeklyHours,
    deriveStandardDayHoursFromWeekly,
    deriveFourDayWeekHoursFromWeekly,
    deriveNineDayFortnightHoursFromWeekly,
    normalizeThemeChoice,
    getScrollPaddingOffset,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.LeaveTrackUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
