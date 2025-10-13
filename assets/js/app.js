'use strict';

(function () {
  const LS_KEYS = {
    theme: 'themeDark',
    themeChoice: 'themeChoice',
    welcomeHidden: 'welcomeDisabled',
    mobileNavSticky: 'mobileNavSticky',
    view: 'activeView',
    collapsible: 'collapsedCards',
    leaveYearStart: 'leaveYearStart',
    standardDayHours: 'standardDayHours',
    fourDayCompressedHours: 'fourDayCompressedHours',
    nineDayCompressedHours: 'nineDayCompressedHours',
  };

  const root = document.documentElement;
  const body = document.body;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const safeSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      /* ignore */
    }
  };

  const safeGet = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };

  const BANK_HOLIDAYS_ENDPOINT = 'https://www.gov.uk/bank-holidays.json';
  const BANK_HOLIDAYS_STORAGE_KEY = 'bankHolidaysCache';
  const BANK_HOLIDAYS_DIVISION = 'england-and-wales';

  const bankHolidayState = {
    events: [],
    fetchedAt: null,
    selectedYear: null,
  };
  let bankHolidayElements = null;
  let bankHolidaysLoading = false;

  const WEEKDAY_INDEX = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const WEEKDAY_LABELS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  const fourDayWeekState = {
    elements: null,
    bookerElements: null,
    initialized: false,
    userOverriddenBankHolidays: false,
    lastDefault: null,
  };

  const nineDayFortnightState = {
    elements: null,
    bookerElements: null,
    initialized: false,
    userOverriddenBankHolidays: false,
    lastDefault: null,
  };

  let welcomeHiddenState = false;

  const DEFAULT_STANDARD_DAY_HOURS = 7.4;
  const DEFAULT_FOUR_DAY_COMPRESSED_HOURS = 8.22;
  const DEFAULT_NINE_DAY_COMPRESSED_HOURS = 9.25;
  const DEFAULT_LEAVE_YEAR_START = { month: 4, day: 6 };

  const settingsState = {
    leaveYearStart: { ...DEFAULT_LEAVE_YEAR_START },
    standardDayHours: DEFAULT_STANDARD_DAY_HOURS,
    fourDayCompressedHours: DEFAULT_FOUR_DAY_COMPRESSED_HOURS,
    nineDayCompressedHours: DEFAULT_NINE_DAY_COMPRESSED_HOURS,
  };

  function applyDarkMode(enabled, { persist = true, withTransition = false } = {}) {
    const shouldEnable = !!enabled;
    if (withTransition) root.classList.add('theme-transition');
    root.classList.toggle('dark', shouldEnable);
    if (withTransition) {
      setTimeout(() => root.classList.remove('theme-transition'), 400);
    } else {
      root.classList.remove('theme-transition');
    }
    const toggle = $('#themeToggle');
    if (toggle) toggle.checked = shouldEnable;
    if (persist) safeSet(LS_KEYS.theme, shouldEnable ? '1' : '0');
  }

  function applyThemeChoice(choice, { persist = true } = {}) {
    const normalized = ['default', 'inverted', 'glass'].includes(choice)
      ? choice
      : 'default';
    root.classList.remove('theme-inverted', 'theme-glass');
    if (normalized === 'inverted') root.classList.add('theme-inverted');
    if (normalized === 'glass') root.classList.add('theme-glass');
    const select = $('#themeSelect');
    if (select && select.value !== normalized) select.value = normalized;
    if (persist) safeSet(LS_KEYS.themeChoice, normalized);
  }

  function applyMobileNavSticky(enabled, { persist = true } = {}) {
    const shouldStick = enabled !== false;
    body.classList.toggle('mobile-header-static', !shouldStick);
    const toggle = $('#mobileNavStickyToggle');
    if (toggle) toggle.checked = shouldStick;
    if (persist) safeSet(LS_KEYS.mobileNavSticky, shouldStick ? '1' : '0');
  }

  function applyFirstTimeHidden(hidden, { persist = true } = {}) {
    const shouldHide = !!hidden;
    welcomeHiddenState = shouldHide;
    $$('[data-first-time]').forEach((el) => el.classList.toggle('hidden', shouldHide));
    const toggle = $('#welcomeToggle');
    if (toggle) toggle.checked = !shouldHide;
    if (persist) safeSet(LS_KEYS.welcomeHidden, shouldHide ? '1' : '0');

    if (shouldHide) {
      if (safeGet(LS_KEYS.view) === 'welcome') safeSet(LS_KEYS.view, 'settings');
      const welcomeSection = document.getElementById('welcome');
      if (welcomeSection && welcomeSection.classList.contains('active')) {
        navigateTo('settings');
      }
    }
  }

  function loadCollapsedCardState() {
    const raw = safeGet(LS_KEYS.collapsible);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const normalized = {};
      Object.keys(parsed).forEach((key) => {
        normalized[key] = !!parsed[key];
      });
      return normalized;
    } catch (_) {
      return {};
    }
  }

  function persistCollapsedCardState(state) {
    try {
      safeSet(LS_KEYS.collapsible, JSON.stringify(state));
    } catch (_) {
      /* ignore */
    }
  }

  function initializeCollapsibles() {
    const cards = $$('[data-collapsible]');
    if (!cards.length) return;

    const storedState = loadCollapsedCardState();
    const knownIds = new Set();

    cards.forEach((card) => {
      const trigger = card.querySelector('[data-collapsible-trigger]');
      const content = card.querySelector('[data-collapsible-content]');
      if (!trigger || !content) return;

      const identifier =
        card.dataset.collapsibleId ||
        card.id ||
        trigger.getAttribute('aria-controls') ||
        '';
      const canPersist = identifier.length > 0;
      if (canPersist) knownIds.add(identifier);

      const setState = (collapsed, { animate = false, persistState = false } = {}) => {
        const expanded = !collapsed;
        trigger.setAttribute('aria-expanded', String(expanded));
        card.classList.toggle('collapsed', collapsed);

        if (!animate) {
          content.hidden = collapsed;
          content.style.height = '';
        } else if (collapsed) {
          const currentHeight = content.scrollHeight;
          content.style.height = `${currentHeight}px`;
          requestAnimationFrame(() => {
            content.style.height = '0px';
          });
          let fallbackId;
          const handle = () => {
            content.hidden = true;
            content.style.height = '';
            content.removeEventListener('transitionend', handle);
            if (fallbackId) clearTimeout(fallbackId);
          };
          fallbackId = window.setTimeout(handle, 350);
          content.addEventListener('transitionend', handle, { once: true });
        } else {
          content.hidden = false;
          const targetHeight = content.scrollHeight;
          content.style.height = '0px';
          requestAnimationFrame(() => {
            content.style.height = `${targetHeight}px`;
          });
          let fallbackId;
          const handle = () => {
            content.style.height = '';
            content.removeEventListener('transitionend', handle);
            if (fallbackId) clearTimeout(fallbackId);
          };
          fallbackId = window.setTimeout(handle, 350);
          content.addEventListener('transitionend', handle, { once: true });
        }

        if (persistState && canPersist) {
          const normalized = !!collapsed;
          if (storedState[identifier] !== normalized) {
            storedState[identifier] = normalized;
            persistCollapsedCardState(storedState);
          }
        }
      };

      const hasStoredValue =
        canPersist && Object.prototype.hasOwnProperty.call(storedState, identifier);
      let defaultCollapsed = false;
      if (hasStoredValue) {
        defaultCollapsed = !!storedState[identifier];
      } else if (
        card.dataset.collapsibleDefault === 'collapsed' ||
        card.dataset.collapsed === 'true'
      ) {
        defaultCollapsed = true;
      }

      setState(defaultCollapsed);

      trigger.addEventListener('click', () => {
        const nextCollapsed = !card.classList.contains('collapsed');
        setState(nextCollapsed, { animate: true, persistState: true });
      });
    });

    let pruned = false;
    Object.keys(storedState).forEach((key) => {
      if (!knownIds.has(key)) {
        delete storedState[key];
        pruned = true;
      }
    });
    if (pruned) persistCollapsedCardState(storedState);
  }

  function getBankHolidayElements() {
    if (bankHolidayElements) return bankHolidayElements;
    const card = document.getElementById('bankHolidaysCard');
    if (!card) return null;
    bankHolidayElements = {
      card,
      list: card.querySelector('[data-bank-holidays-list]'),
      yearSelect: card.querySelector('[data-bank-holidays-year]'),
      loading: card.querySelector('[data-bank-holidays-loading]'),
      error: card.querySelector('[data-bank-holidays-error]'),
      empty: card.querySelector('[data-bank-holidays-empty]'),
      refresh: card.querySelector('[data-action="refresh-bank-holidays"]'),
      rangeInfo: card.querySelector('[data-bank-holidays-range]'),
    };
    return bankHolidayElements;
  }

  function loadStoredBankHolidays() {
    const raw = safeGet(BANK_HOLIDAYS_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const events = Array.isArray(parsed.events)
        ? parsed.events
            .map((event) => {
              const date = typeof event?.date === 'string' ? event.date : '';
              if (!date || Number.isNaN(Date.parse(date))) return null;
              return {
                date,
                title:
                  typeof event?.title === 'string' && event.title.trim().length
                    ? event.title.trim()
                    : 'Bank holiday',
                notes: typeof event?.notes === 'string' ? event.notes.trim() : '',
                bunting: !!event?.bunting,
              };
            })
            .filter(Boolean)
        : [];
      const fetchedAt = typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : null;
      return {
        events: events.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        ),
        fetchedAt,
      };
    } catch (_) {
      return null;
    }
  }

  function storeBankHolidays(state) {
    try {
      safeSet(
        BANK_HOLIDAYS_STORAGE_KEY,
        JSON.stringify({
          fetchedAt: state.fetchedAt,
          events: state.events.map((event) => ({
            date: event.date,
            title: event.title,
            notes: event.notes,
            bunting: !!event.bunting,
          })),
        })
      );
    } catch (_) {
      /* ignore */
    }
  }

  function parseBankHolidayEvents(payload) {
    if (!payload || typeof payload !== 'object') return [];
    const division = payload[BANK_HOLIDAYS_DIVISION];
    if (!division || typeof division !== 'object' || !Array.isArray(division.events)) return [];
    return division.events
      .map((event) => {
        const date = typeof event?.date === 'string' ? event.date : '';
        if (!date || Number.isNaN(Date.parse(date))) return null;
        return {
          date,
          title:
            typeof event?.title === 'string' && event.title.trim().length
              ? event.title.trim()
              : 'Bank holiday',
          notes: typeof event?.notes === 'string' ? event.notes.trim() : '',
          bunting: !!event?.bunting,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  function formatBankHolidayDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function formatMonthDayShort(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
  }

  function formatHumanDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function toStartOfDay(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function formatDateForInput(date) {
    const normalized = toStartOfDay(date);
    if (!normalized) return '';
    const year = normalized.getFullYear();
    const month = String(normalized.getMonth() + 1).padStart(2, '0');
    const day = String(normalized.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function sanitizeLeaveYearParts(parts) {
    if (!parts || typeof parts !== 'object') return null;
    const month = Number.parseInt(parts.month, 10);
    const day = Number.parseInt(parts.day, 10);
    if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { month, day };
  }

  function parseLeaveYearStartValue(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsedDate = toStartOfDay(trimmed);
      if (!parsedDate) return null;
      return { month: parsedDate.getMonth() + 1, day: parsedDate.getDate() };
    }
    if (/^\d{2}-\d{2}$/.test(trimmed)) {
      const [monthStr, dayStr] = trimmed.split('-');
      const month = Number.parseInt(monthStr, 10);
      const day = Number.parseInt(dayStr, 10);
      if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return { month, day };
    }
    return null;
  }

  function formatLeaveYearStart(parts) {
    const sanitized = sanitizeLeaveYearParts(parts) || DEFAULT_LEAVE_YEAR_START;
    const month = String(sanitized.month).padStart(2, '0');
    const day = String(sanitized.day).padStart(2, '0');
    return `${month}-${day}`;
  }

  function getLeaveYearStartParts() {
    return sanitizeLeaveYearParts(settingsState.leaveYearStart) || {
      ...DEFAULT_LEAVE_YEAR_START,
    };
  }

  function getLeaveYearStartDateForYear(year) {
    if (!Number.isFinite(year)) return null;
    const parts = getLeaveYearStartParts();
    const safeYear = Math.trunc(year);
    const base = new Date(safeYear, parts.month - 1, 1);
    if (Number.isNaN(base.getTime())) return null;
    const daysInMonth = new Date(safeYear, parts.month, 0).getDate();
    const safeDay = Math.min(parts.day, daysInMonth);
    base.setDate(safeDay);
    base.setHours(0, 0, 0, 0);
    return base;
  }

  function getLeaveYearEndDateForYear(year) {
    const start = getLeaveYearStartDateForYear(year);
    if (!start) return null;
    const end = new Date(start.getTime());
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  function formatLeaveYearRange(range) {
    if (!range || !(range.start instanceof Date) || !(range.end instanceof Date)) return '';
    const startLabel = formatHumanDate(range.start);
    const endLabel = formatHumanDate(range.end);
    if (!startLabel || !endLabel) return '';
    return `${startLabel} to ${endLabel}`;
  }

  function formatLeaveYearRangeShort(range) {
    if (!range || !(range.start instanceof Date) || !(range.end instanceof Date)) return '';
    const startLabel = formatMonthDayShort(range.start);
    const endLabel = formatMonthDayShort(range.end);
    if (!startLabel || !endLabel) return '';
    return `${startLabel} – ${endLabel}`;
  }

  function setLeaveYearStart(parts, { persist = true } = {}) {
    const sanitized = sanitizeLeaveYearParts(parts) || DEFAULT_LEAVE_YEAR_START;
    settingsState.leaveYearStart = { ...sanitized };
    if (persist) safeSet(LS_KEYS.leaveYearStart, formatLeaveYearStart(sanitized));
    return settingsState.leaveYearStart;
  }

  function normalizeHoursValue(value, fallback) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.round(parsed * 100) / 100;
  }

  function setStandardDayHours(value, { persist = true } = {}) {
    const normalized = normalizeHoursValue(value, DEFAULT_STANDARD_DAY_HOURS);
    settingsState.standardDayHours = normalized;
    if (persist) safeSet(LS_KEYS.standardDayHours, String(normalized));
    return normalized;
  }

  function setFourDayCompressedHours(value, { persist = true } = {}) {
    const normalized = normalizeHoursValue(value, DEFAULT_FOUR_DAY_COMPRESSED_HOURS);
    settingsState.fourDayCompressedHours = normalized;
    if (persist) safeSet(LS_KEYS.fourDayCompressedHours, String(normalized));
    return normalized;
  }

  function setNineDayCompressedHours(value, { persist = true } = {}) {
    const normalized = normalizeHoursValue(value, DEFAULT_NINE_DAY_COMPRESSED_HOURS);
    settingsState.nineDayCompressedHours = normalized;
    if (persist) safeSet(LS_KEYS.nineDayCompressedHours, String(normalized));
    return normalized;
  }

  function getStandardDayHours() {
    return Number.isFinite(settingsState.standardDayHours)
      ? settingsState.standardDayHours
      : DEFAULT_STANDARD_DAY_HOURS;
  }

  function getFourDayCompressedHours() {
    return Number.isFinite(settingsState.fourDayCompressedHours)
      ? settingsState.fourDayCompressedHours
      : DEFAULT_FOUR_DAY_COMPRESSED_HOURS;
  }

  function getNineDayCompressedHours() {
    return Number.isFinite(settingsState.nineDayCompressedHours)
      ? settingsState.nineDayCompressedHours
      : DEFAULT_NINE_DAY_COMPRESSED_HOURS;
  }

  function loadPersistedSettings() {
    const storedLeaveYear = parseLeaveYearStartValue(safeGet(LS_KEYS.leaveYearStart));
    setLeaveYearStart(storedLeaveYear || DEFAULT_LEAVE_YEAR_START, { persist: false });

    const storedStandard = safeGet(LS_KEYS.standardDayHours);
    if (storedStandard !== null) {
      setStandardDayHours(storedStandard, { persist: false });
    } else {
      setStandardDayHours(DEFAULT_STANDARD_DAY_HOURS, { persist: false });
    }

    const storedFourDay = safeGet(LS_KEYS.fourDayCompressedHours);
    if (storedFourDay !== null) {
      setFourDayCompressedHours(storedFourDay, { persist: false });
    } else {
      setFourDayCompressedHours(DEFAULT_FOUR_DAY_COMPRESSED_HOURS, { persist: false });
    }

    const storedNineDay = safeGet(LS_KEYS.nineDayCompressedHours);
    if (storedNineDay !== null) {
      setNineDayCompressedHours(storedNineDay, { persist: false });
    } else {
      setNineDayCompressedHours(DEFAULT_NINE_DAY_COMPRESSED_HOURS, { persist: false });
    }
  }

  loadPersistedSettings();

  function getFinancialYearRange(date) {
    const normalized = toStartOfDay(date);
    if (!normalized) return null;
    let startYear = normalized.getFullYear();
    const currentStart = getLeaveYearStartDateForYear(startYear);
    if (!currentStart) return null;
    if (normalized.getTime() < currentStart.getTime()) {
      startYear -= 1;
    }
    const rangeStart = getLeaveYearStartDateForYear(startYear);
    const rangeEnd = getLeaveYearEndDateForYear(startYear);
    if (!rangeStart || !rangeEnd) return null;
    return { start: rangeStart, end: rangeEnd };
  }

  function getCurrentLeaveYearRange() {
    return getFinancialYearRange(new Date());
  }

  function getFinancialYearStartYear(date) {
    const range = getFinancialYearRange(date);
    if (!range) return null;
    return range.start.getFullYear();
  }

  function formatFinancialYearLabel(startYear) {
    if (!Number.isFinite(startYear)) return '';
    const endYear = startYear + 1;
    const rangeStart = getLeaveYearStartDateForYear(startYear);
    const rangeEnd = getLeaveYearEndDateForYear(startYear);
    const shortRange =
      rangeStart && rangeEnd
        ? formatLeaveYearRangeShort({ start: rangeStart, end: rangeEnd })
        : '';
    return shortRange ? `${startYear} to ${endYear} (${shortRange})` : `${startYear} to ${endYear}`;
  }

  function toDateKey(value) {
    const normalized = toStartOfDay(value);
    if (!normalized) return '';
    const year = normalized.getFullYear();
    const month = String(normalized.getMonth() + 1).padStart(2, '0');
    const day = String(normalized.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function computeFinancialYearBankHolidayDefault(startDate) {
    if (!bankHolidayState.events.length) return null;
    const range = getFinancialYearRange(startDate);
    if (!range) return null;

    const startNormalized = toStartOfDay(startDate);
    if (!startNormalized) return null;

    const rangeStart = toStartOfDay(range.start);
    const rangeEnd = new Date(range.end.getTime());
    rangeEnd.setHours(23, 59, 59, 999);

    const today = toStartOfDay(new Date());
    let effectiveStart = startNormalized < rangeStart ? rangeStart : startNormalized;

    if (today && today >= rangeStart && today <= rangeEnd && today > effectiveStart) {
      effectiveStart = today;
    }

    if (effectiveStart > rangeEnd) {
      return {
        count: 0,
        rangeStart,
        rangeEnd,
        effectiveStart,
      };
    }

    const count = bankHolidayState.events.reduce((total, event) => {
      const eventDate = toStartOfDay(event.date);
      if (!eventDate) return total;
      if (eventDate < effectiveStart || eventDate > rangeEnd) return total;
      return total + 1;
    }, 0);

    return {
      count,
      rangeStart,
      rangeEnd,
      effectiveStart,
    };
  }

  function getFourDayWeekElements() {
    if (fourDayWeekState.elements) return fourDayWeekState.elements;
    const card = document.getElementById('fourDayWeekCard');
    if (!card) return null;
    const elements = {
      card,
      start: card.querySelector('#fourDayStartDate'),
      core: card.querySelector('#fourDayCoreLeave'),
      longService: card.querySelector('#fourDayLongService'),
      carryOver: card.querySelector('#fourDayCarryOver'),
      purchased: card.querySelector('#fourDayPurchased'),
      bankHolidays: card.querySelector('#fourDayBankHolidays'),
      summary: card.querySelector('[data-four-day-summary]'),
      summaryIntro: card.querySelector('[data-four-day-summary-intro]'),
      breakdown: card.querySelector('[data-four-day-breakdown]'),
      totals: card.querySelector('[data-four-day-totals]'),
      totalDays: card.querySelector('[data-four-day-total-days]'),
      totalHours: card.querySelector('[data-four-day-total-hours]'),
      totalCompressed: card.querySelector('[data-four-day-total-compressed]'),
      equation: card.querySelector('[data-four-day-equation]'),
      bankHolidayHelp: card.querySelector('[data-four-day-bankholidays-help]'),
    };
    fourDayWeekState.elements = elements;
    return elements;
  }

  function getNineDayFortnightElements() {
    if (nineDayFortnightState.elements) return nineDayFortnightState.elements;
    const card = document.getElementById('nineDayFortnightCard');
    if (!card) return null;
    const elements = {
      card,
      start: card.querySelector('#nineDayStartDate'),
      core: card.querySelector('#nineDayCoreLeave'),
      longService: card.querySelector('#nineDayLongService'),
      carryOver: card.querySelector('#nineDayCarryOver'),
      purchased: card.querySelector('#nineDayPurchased'),
      bankHolidays: card.querySelector('#nineDayBankHolidays'),
      summary: card.querySelector('[data-nine-day-summary]'),
      summaryIntro: card.querySelector('[data-nine-day-summary-intro]'),
      breakdown: card.querySelector('[data-nine-day-breakdown]'),
      totals: card.querySelector('[data-nine-day-totals]'),
      totalDays: card.querySelector('[data-nine-day-total-days]'),
      totalHours: card.querySelector('[data-nine-day-total-hours]'),
      totalCompressed: card.querySelector('[data-nine-day-total-compressed]'),
      equation: card.querySelector('[data-nine-day-equation]'),
      bankHolidayHelp: card.querySelector('[data-nine-day-bankholidays-help]'),
    };
    nineDayFortnightState.elements = elements;
    return elements;
  }

  function getBankHolidayBookerElements() {
    if (fourDayWeekState.bookerElements) return fourDayWeekState.bookerElements;
    const card = document.getElementById('bankHolidayBookerCard');
    if (!card) return null;
    const elements = {
      card,
      daySelect: card.querySelector('#bankHolidayBookerDay'),
      message: card.querySelector('[data-booker-message]'),
      results: card.querySelector('[data-booker-results]'),
      matchesLabel: card.querySelector('[data-booker-matches-label]'),
      matchesList: card.querySelector('[data-booker-matches-list]'),
      nonMatchesLabel: card.querySelector('[data-booker-non-matches-label]'),
      nonMatchesList: card.querySelector('[data-booker-non-matches-list]'),
    };
    fourDayWeekState.bookerElements = elements;
    return elements;
  }

  function getNineDayFortnightBookerElements() {
    if (nineDayFortnightState.bookerElements) return nineDayFortnightState.bookerElements;
    const card = document.getElementById('nineDayFortnightBookerCard');
    if (!card) return null;
    const elements = {
      card,
      startDate: card.querySelector('#nineDayBookerStartDate'),
      message: card.querySelector('[data-nine-day-booker-message]'),
      results: card.querySelector('[data-nine-day-booker-results]'),
      matchesLabel: card.querySelector('[data-nine-day-booker-matches-label]'),
      matchesList: card.querySelector('[data-nine-day-booker-matches-list]'),
      nonMatchesLabel: card.querySelector('[data-nine-day-booker-non-matches-label]'),
      nonMatchesList: card.querySelector('[data-nine-day-booker-non-matches-list]'),
    };
    nineDayFortnightState.bookerElements = elements;
    return elements;
  }

  function updateBankHolidayBooker() {
    const booker = getBankHolidayBookerElements();
    if (!booker) return;
    const {
      daySelect,
      message,
      results,
      matchesLabel,
      matchesList,
      nonMatchesLabel,
      nonMatchesList,
    } = booker;

    if (matchesList) matchesList.innerHTML = '';
    if (nonMatchesList) nonMatchesList.innerHTML = '';
    if (results) results.hidden = true;

    const dayValue = daySelect ? String(daySelect.value || '').toLowerCase() : '';
    if (!dayValue) {
      if (message) {
        message.textContent = 'Select a non-working day to preview matching bank holidays.';
      }
      return;
    }

    const fourDayElements = getFourDayWeekElements();
    const startInput = fourDayElements ? fourDayElements.start : null;
    const startValue = startInput ? startInput.value : '';

    if (!startValue) {
      if (message) {
        message.textContent = 'Enter a start date above to calculate bank holiday matches.';
      }
      return;
    }

    if (!bankHolidayState.events.length) {
      if (message) {
        message.textContent =
          'Bank holiday data is unavailable. Refresh from the Bank Holidays page to load the latest information.';
      }
      return;
    }

    const startDate = toStartOfDay(startValue);
    if (!startDate) {
      if (message) {
        message.textContent = 'Enter a valid start date above to calculate bank holiday matches.';
      }
      return;
    }

    const computed = computeFinancialYearBankHolidayDefault(startDate);
    if (!computed) {
      if (message) {
        message.textContent = 'Unable to determine the organisational working year for the selected start date.';
      }
      return;
    }

    const { effectiveStart, rangeEnd } = computed;
    if (!effectiveStart || !rangeEnd) {
      if (message) {
        message.textContent = 'Unable to determine the remaining range for the selected start date.';
      }
      return;
    }

    const targetDayIndex = WEEKDAY_INDEX[dayValue];
    if (typeof targetDayIndex !== 'number') {
      if (message) {
        message.textContent = 'Select a valid weekly non-working day to continue.';
      }
      return;
    }

    const eventsInRange = bankHolidayState.events
      .map((event) => {
        const eventDate = toStartOfDay(event.date);
        if (!eventDate) return null;
        return {
          title: event.title,
          notes: event.notes,
          date: eventDate,
        };
      })
      .filter(
        (event) => event && event.date >= effectiveStart && event.date <= rangeEnd
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (!eventsInRange.length) {
      if (message) {
        const startLabel = formatHumanDate(effectiveStart);
        const endLabel = formatHumanDate(rangeEnd);
        message.textContent = `No remaining bank holidays between ${startLabel} and ${endLabel} in this organisational working year.`;
      }
      return;
    }

    const matches = [];
    const others = [];

    eventsInRange.forEach((event) => {
      const weekdayIndex = event.date.getDay();
      if (weekdayIndex === targetDayIndex) {
        matches.push(event);
      } else {
        others.push(event);
      }
    });

    const selectedOption =
      daySelect &&
      daySelect.selectedIndex >= 0 &&
      daySelect.options[daySelect.selectedIndex]
        ? daySelect.options[daySelect.selectedIndex]
        : null;
    const selectedDayLabel = selectedOption
      ? selectedOption.textContent.trim()
      : WEEKDAY_LABELS[targetDayIndex] || 'day';

    if (matchesLabel) {
      matchesLabel.textContent = `Bank holidays on ${selectedDayLabel} (${matches.length})`;
    }
    if (nonMatchesLabel) {
      nonMatchesLabel.textContent = `Bank holidays on other days (${others.length})`;
    }

    const renderList = (listEl, items) => {
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!items.length) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'text-sm text-gray-500 dark:text-gray-400';
        emptyItem.textContent = 'None remaining.';
        listEl.appendChild(emptyItem);
        return;
      }

      items.forEach((item) => {
        const entry = document.createElement('li');
        entry.className =
          'rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 space-y-1 border border-gray-200 dark:border-gray-700';
        const title = document.createElement('p');
        title.className = 'font-medium text-gray-900 dark:text-gray-100';
        title.textContent = item.title || 'Bank holiday';
        entry.appendChild(title);
        const dateLine = document.createElement('p');
        dateLine.className = 'text-xs text-gray-600 dark:text-gray-400';
        dateLine.textContent = formatBankHolidayDate(item.date);
        entry.appendChild(dateLine);
        if (item.notes) {
          const notes = document.createElement('p');
          notes.className = 'text-xs text-gray-500 dark:text-gray-400';
          notes.textContent = item.notes;
          entry.appendChild(notes);
        }
        listEl.appendChild(entry);
      });
    };

    renderList(matchesList, matches);
    renderList(nonMatchesList, others);

    if (message) {
      const startLabel = formatHumanDate(effectiveStart);
      const endLabel = formatHumanDate(rangeEnd);
      message.textContent = `Highlighting bank holidays between ${startLabel} and ${endLabel} in this organisational working year.`;
    }

    if (results) {
      results.hidden = false;
    }
  }

  function formatNumberWithPrecision(value, fractionDigits = 2) {
    const number = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    }).format(number);
  }

  const HTML_ESCAPE_LOOKUP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (match) => HTML_ESCAPE_LOOKUP[match] || match);
  }

  function formatDaysDisplay(value) {
    return `${formatNumberWithPrecision(value)} days`;
  }

  function formatHoursDisplay(value) {
    return `${formatNumberWithPrecision(value, 2)} hours`;
  }

  function getNumericInputValue(input, { allowDecimal = true } = {}) {
    if (!input) return 0;
    const value = input.value.trim();
    if (!value) return 0;
    const parsed = allowDecimal ? Number.parseFloat(value) : Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function getLeaveComponents(elements) {
    if (!elements) return [];
    const { core, longService, carryOver, purchased, bankHolidays } = elements;
    return [
      { id: 'core', label: 'Core annual leave', value: getNumericInputValue(core) },
      { id: 'longService', label: 'Long service leave', value: getNumericInputValue(longService) },
      { id: 'carryOver', label: 'Carry over leave', value: getNumericInputValue(carryOver) },
      { id: 'purchased', label: 'Purchased leave', value: getNumericInputValue(purchased, { allowDecimal: false }) },
      {
        id: 'bankHolidays',
        label: 'Bank holidays',
        value: getNumericInputValue(bankHolidays, { allowDecimal: false }),
      },
    ];
  }

  function updateFourDayWeekSummary() {
    const elements = getFourDayWeekElements();
    if (!elements) return;
    const { core, longService, carryOver, purchased, bankHolidays, breakdown, totals, totalDays, totalHours, totalCompressed, equation, summaryIntro } = elements;
    const setStatValue = (wrapper, value) => {
      if (!wrapper) return;
      const valueEl = wrapper.querySelector('.stat-card__value');
      if (!valueEl) return;
      valueEl.textContent = value;
    };

    const components = getLeaveComponents(elements);

    const hasValues = components.some((component) => component.value);

    if (!hasValues) {
      if (breakdown) {
        breakdown.innerHTML = '';
        breakdown.hidden = true;
      }
      if (totals) totals.hidden = true;
      if (equation) {
        equation.textContent = '';
        equation.hidden = true;
      }
      if (summaryIntro) {
        summaryIntro.textContent =
          "Enter values above to see a detailed breakdown of the individual's allowance.";
      }
      setStatValue(totalDays, formatDaysDisplay(0));
      setStatValue(totalHours, formatHoursDisplay(0));
      setStatValue(totalCompressed, formatDaysDisplay(0));
      return;
    }

    const totalDaysValue = components.reduce((sum, component) => sum + component.value, 0);
    const standardHours = getStandardDayHours();
    const totalHoursValue = totalDaysValue * standardHours;

    if (breakdown) {
      breakdown.innerHTML = '';
      components.forEach((component) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-start justify-between gap-4';
        const term = document.createElement('dt');
        term.className = 'font-medium text-gray-900 dark:text-gray-100';
        term.textContent = component.label;
        const definition = document.createElement('dd');
        definition.className = 'text-right text-gray-700 dark:text-gray-300';
        definition.textContent = formatDaysDisplay(component.value);
        wrapper.appendChild(term);
        wrapper.appendChild(definition);
        breakdown.appendChild(wrapper);
      });
      breakdown.hidden = false;
    }

    const fourDayHours = getFourDayCompressedHours();
    const compressedAllowanceValue = fourDayHours > 0 ? totalHoursValue / fourDayHours : 0;

    if (totals && totalDays && totalHours && equation) {
      totals.hidden = false;
      setStatValue(totalDays, formatDaysDisplay(totalDaysValue));
      setStatValue(totalHours, formatHoursDisplay(totalHoursValue));
      setStatValue(totalCompressed, formatDaysDisplay(compressedAllowanceValue));
      equation.textContent = '';
      equation.hidden = true;
    }

    if (summaryIntro) {
      summaryIntro.textContent = "Breakdown of the individual's 4-day week leave allowance:";
    }
  }

  function updateNineDayFortnightSummary() {
    const elements = getNineDayFortnightElements();
    if (!elements) return;
    const {
      core,
      longService,
      carryOver,
      purchased,
      bankHolidays,
      breakdown,
      totals,
      totalDays,
      totalHours,
      totalCompressed,
      equation,
      summaryIntro,
    } = elements;

    const setStatValue = (wrapper, value) => {
      if (!wrapper) return;
      const valueEl = wrapper.querySelector('.stat-card__value');
      if (!valueEl) return;
      valueEl.textContent = value;
    };

    const components = getLeaveComponents(elements);

    const hasValues = components.some((component) => component.value);

    if (!hasValues) {
      if (breakdown) {
        breakdown.innerHTML = '';
        breakdown.hidden = true;
      }
      if (totals) totals.hidden = true;
      if (equation) {
        equation.textContent = '';
        equation.hidden = true;
      }
      if (summaryIntro) {
        summaryIntro.textContent =
          "Enter values above to see a detailed breakdown of the individual's allowance.";
      }
      setStatValue(totalDays, formatDaysDisplay(0));
      setStatValue(totalHours, formatHoursDisplay(0));
      setStatValue(totalCompressed, formatDaysDisplay(0));
      return;
    }

    const totalDaysValue = components.reduce((sum, component) => sum + component.value, 0);
    const standardHours = getStandardDayHours();
    const totalHoursValue = totalDaysValue * standardHours;

    if (breakdown) {
      breakdown.innerHTML = '';
      components.forEach((component) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-start justify-between gap-4';
        const term = document.createElement('dt');
        term.className = 'font-medium text-gray-900 dark:text-gray-100';
        term.textContent = component.label;
        const definition = document.createElement('dd');
        definition.className = 'text-right text-gray-700 dark:text-gray-300';
        definition.textContent = formatDaysDisplay(component.value);
        wrapper.appendChild(term);
        wrapper.appendChild(definition);
        breakdown.appendChild(wrapper);
      });
      breakdown.hidden = false;
    }

    const nineDayHours = getNineDayCompressedHours();
    const compressedAllowanceValue = nineDayHours > 0 ? totalHoursValue / nineDayHours : 0;

    if (totals && totalDays && totalHours && equation) {
      totals.hidden = false;
      setStatValue(totalDays, formatDaysDisplay(totalDaysValue));
      setStatValue(totalHours, formatHoursDisplay(totalHoursValue));
      setStatValue(totalCompressed, formatDaysDisplay(compressedAllowanceValue));
      equation.textContent = '';
      equation.hidden = true;
    }

    if (summaryIntro) {
      summaryIntro.textContent = "Breakdown of the individual's 9-day fortnight leave allowance:";
    }
  }

  function createLeaveReportPayload(elements, compressedDayHours) {
    const components = getLeaveComponents(elements);
    const hasValues = components.some((component) => component.value);
    const totalDaysValue = components.reduce((sum, component) => sum + component.value, 0);
    const standardHours = getStandardDayHours();
    const totalHoursValue = totalDaysValue * standardHours;
    const normalizedCompressedHours = Number.isFinite(compressedDayHours)
      ? compressedDayHours
      : 0;
    const compressedAllowanceValue =
      normalizedCompressedHours > 0 ? totalHoursValue / normalizedCompressedHours : 0;
    const startValue = elements && elements.start ? elements.start.value : '';
    const startDate = startValue ? toStartOfDay(startValue) : null;
    return {
      components,
      hasValues,
      totalDaysValue,
      totalHoursValue,
      compressedAllowanceValue,
      startDate,
    };
  }

  function buildBankHolidayReportNote({ overridden, lastDefault }) {
    if (overridden) {
      return 'Bank holidays value entered manually.';
    }
    if (lastDefault && typeof lastDefault === 'object') {
      const { count, effectiveStart, rangeEnd } = lastDefault;
      const countText = Number.isFinite(count) ? ` (${count} days)` : '';
      if (effectiveStart && rangeEnd) {
        const startLabel = formatHumanDate(effectiveStart);
        const endLabel = formatHumanDate(rangeEnd);
        if (startLabel && endLabel) {
          return `Bank holidays automatically calculated${countText} between ${startLabel} and ${endLabel} in the configured organisational working year based on the selected start date.`;
        }
      }
      if (Number.isFinite(count)) {
        return `Bank holidays automatically calculated${countText} based on the selected start date within the configured organisational working year.`;
      }
    }
    return 'Bank holidays value automatically calculated using the configured organisational working year when available.';
  }

  function openPrintWindowWithHtml(html, title) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    document.body.appendChild(iframe);

    const cleanup = () => {
      requestAnimationFrame(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      });
    };

    const { contentDocument, contentWindow } = iframe;
    if (!contentDocument || !contentWindow) {
      cleanup();
      showAlert('Unable to prepare the PDF preview. Please try again.');
      return;
    }

    try {
      contentDocument.open();
      contentDocument.write(html);
      contentDocument.close();
    } catch (error) {
      console.error('Unable to prepare print preview', error);
      cleanup();
      showAlert('Unable to prepare the PDF preview. Please try again.');
      return;
    }

    let triggered = false;
    const triggerPrint = () => {
      if (triggered) return;
      triggered = true;
      try {
        if (title) {
          contentDocument.title = title;
        }
      } catch (_) {
        /* ignore */
      }
      try {
        contentWindow.focus();
      } catch (_) {
        /* ignore */
      }
      try {
        contentWindow.print();
      } catch (error) {
        console.error('Print request failed', error);
      }
      cleanup();
    };

    if (contentDocument.readyState === 'complete') {
      setTimeout(triggerPrint, 0);
    } else {
      contentWindow.addEventListener('load', triggerPrint, { once: true });
      contentDocument.addEventListener('DOMContentLoaded', triggerPrint, { once: true });
      setTimeout(triggerPrint, 500);
    }
  }

  function getFourDayBookerReportData() {
    const elements = getFourDayWeekElements();
    const booker = getBankHolidayBookerElements();
    if (!elements || !booker) return null;

    const base = {
      title: 'Bank holiday booker',
      message: '',
      matchesLabel: '',
      matches: [],
      matchesEmptyLabel: 'None remaining.',
      nonMatchesLabel: '',
      nonMatches: [],
      nonMatchesEmptyLabel: 'None remaining.',
    };

    if (!bankHolidayState.events.length) {
      return {
        ...base,
        message:
          'Bank holiday data is unavailable. Refresh from the Bank Holidays page to load the latest information.',
      };
    }

    const { start } = elements;
    const { daySelect } = booker;
    const dayValue = daySelect ? String(daySelect.value || '').toLowerCase() : '';

    if (!dayValue) {
      return null;
    }

    const startValue = start ? start.value : '';
    if (!startValue) {
      return null;
    }

    const startDate = toStartOfDay(startValue);
    if (!startDate) {
      return {
        ...base,
        message: 'Enter a valid start date above to calculate bank holiday matches.',
      };
    }

    const computed = computeFinancialYearBankHolidayDefault(startDate);
    if (!computed) {
      return {
        ...base,
        message: 'Unable to determine the organisational working year for the selected start date.',
      };
    }

    const { effectiveStart, rangeEnd } = computed;
    if (!effectiveStart || !rangeEnd) {
      return {
        ...base,
        message: 'Unable to determine the remaining range for the selected start date.',
      };
    }

    const targetDayIndex = WEEKDAY_INDEX[dayValue];
    if (typeof targetDayIndex !== 'number') {
      return {
        ...base,
        message: 'Select a valid weekly non-working day to continue.',
      };
    }

    const eventsInRange = bankHolidayState.events
      .map((event) => {
        const eventDate = toStartOfDay(event.date);
        if (!eventDate) return null;
        return {
          title: event.title || 'Bank holiday',
          notes: event.notes || '',
          date: eventDate,
        };
      })
      .filter((event) => event && event.date >= effectiveStart && event.date <= rangeEnd)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (!eventsInRange.length) {
      const startLabel = formatHumanDate(effectiveStart);
      const endLabel = formatHumanDate(rangeEnd);
      return {
        ...base,
        message: `No remaining bank holidays between ${startLabel} and ${endLabel} in this organisational working year.`,
      };
    }

    const matches = [];
    const others = [];

    eventsInRange.forEach((event) => {
      if (event.date.getDay() === targetDayIndex) {
        matches.push(event);
      } else {
        others.push(event);
      }
    });

    const selectedOption =
      daySelect &&
      daySelect.selectedIndex >= 0 &&
      daySelect.options[daySelect.selectedIndex]
        ? daySelect.options[daySelect.selectedIndex]
        : null;
    const selectedDayLabel = selectedOption
      ? selectedOption.textContent.trim()
      : WEEKDAY_LABELS[targetDayIndex] || 'day';

    const startLabel = formatHumanDate(effectiveStart);
    const endLabel = formatHumanDate(rangeEnd);

    return {
      ...base,
      message: `Highlighting bank holidays between ${startLabel} and ${endLabel} in this organisational working year.`,
      matchesLabel: `Bank holidays on ${selectedDayLabel} (${matches.length})`,
      nonMatchesLabel: `Bank holidays on other days (${others.length})`,
      matches: matches.map((event) => ({
        title: event.title || 'Bank holiday',
        date: formatBankHolidayDate(event.date),
        notes: event.notes || '',
      })),
      nonMatches: others.map((event) => ({
        title: event.title || 'Bank holiday',
        date: formatBankHolidayDate(event.date),
        notes: event.notes || '',
      })),
    };
  }

  function getNineDayBookerReportData() {
    const booker = getNineDayFortnightBookerElements();
    if (!booker) return null;

    const base = {
      title: 'Bank holiday booker',
      message: '',
      matchesLabel: '',
      matches: [],
      matchesEmptyLabel: 'None in this window.',
      nonMatchesLabel: '',
      nonMatches: [],
      nonMatchesEmptyLabel: 'None in this window.',
    };

    if (!bankHolidayState.events.length) {
      return {
        ...base,
        message:
          'Bank holiday data is unavailable. Refresh from the Bank Holidays page to load the latest information.',
      };
    }

    const { startDate } = booker;
    const startValue = startDate ? startDate.value : '';
    if (!startValue) {
      return null;
    }

    const start = toStartOfDay(startValue);
    if (!start) {
      return {
        ...base,
        message: 'Enter a valid first non-working day to continue.',
      };
    }

    const range = getFinancialYearRange(start);
    if (!range) {
      return {
        ...base,
        message: 'Unable to determine the organisational working year for the selected date.',
      };
    }

    const windowEnd = new Date(range.end.getTime());
    if (start.getTime() > windowEnd.getTime()) {
      return {
        ...base,
        message: 'No dates in range.',
      };
    }

    const patternDates = new Set();
    for (
      let cursor = new Date(start.getTime());
      cursor.getTime() <= windowEnd.getTime();
      cursor.setDate(cursor.getDate() + 14)
    ) {
      patternDates.add(toDateKey(cursor));
    }

    const eventsInWindow = bankHolidayState.events
      .map((event) => {
        const eventDate = toStartOfDay(event.date);
        if (!eventDate) return null;
        return {
          title: event.title || 'Bank holiday',
          notes: event.notes || '',
          date: eventDate,
          key: toDateKey(eventDate),
        };
      })
      .filter(
        (event) =>
          event &&
          event.date.getTime() >= start.getTime() &&
          event.date.getTime() <= windowEnd.getTime()
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const matches = [];
    const nonMatches = [];

    eventsInWindow.forEach((event) => {
      if (patternDates.has(event.key)) {
        matches.push(event);
      } else {
        nonMatches.push(event);
      }
    });

    const startLabel = formatHumanDate(start);
    const endLabel = formatHumanDate(windowEnd);

    let message;
    if (matches.length) {
      message = `Found ${matches.length} bank holidays on the every other week pattern between ${startLabel} and ${endLabel} in this organisational working year.`;
    } else if (eventsInWindow.length) {
      message = `No bank holidays align with this every other week pattern between ${startLabel} and ${endLabel} in this organisational working year. Showing other bank holidays for reference.`;
    } else {
      message = `No bank holidays fall between ${startLabel} and ${endLabel} in this organisational working year.`;
    }

    return {
      ...base,
      message,
      matchesLabel: `Bank holidays on non-working days (${matches.length})`,
      nonMatchesLabel: `Other bank holidays in range (${nonMatches.length})`,
      matches: matches.map((event) => ({
        title: event.title || 'Bank holiday',
        date: formatBankHolidayDate(event.date),
        notes: event.notes || '',
      })),
      nonMatches: nonMatches.map((event) => ({
        title: event.title || 'Bank holiday',
        date: formatBankHolidayDate(event.date),
        notes: event.notes || '',
      })),
    };
  }

  function buildBookerListSection({ label, items, emptyLabel }) {
    if (!label) return '';
    const listItems = Array.isArray(items) && items.length
      ? items
          .map((item) => {
            const title = escapeHtml(item.title || 'Bank holiday');
            const date = escapeHtml(item.date || '');
            const notes = item.notes
              ? `<p class="event-item__notes">${escapeHtml(item.notes)}</p>`
              : '';
            return `<li class="event-item"><p class="event-item__title">${title}</p><p class="event-item__meta">${date}</p>${notes}</li>`;
          })
          .join('')
      : `<li class="event-item event-item--empty">${escapeHtml(emptyLabel || 'None.')}</li>`;

    return `<div class="list-section"><h3 class="subheading">${escapeHtml(label)}</h3><ul class="event-list">${listItems}</ul></div>`;
  }

  function buildBookerReportSection(report) {
    if (!report) return '';
    const intro = report.message ? `<p class="note">${escapeHtml(report.message)}</p>` : '';
    const matchesSection = buildBookerListSection({
      label: report.matchesLabel,
      items: report.matches,
      emptyLabel: report.matchesEmptyLabel,
    });
    const nonMatchesSection = buildBookerListSection({
      label: report.nonMatchesLabel,
      items: report.nonMatches,
      emptyLabel: report.nonMatchesEmptyLabel,
    });

    if (!intro && !matchesSection && !nonMatchesSection) {
      return '';
    }

    return `<section class="section"><h2>${escapeHtml(report.title || 'Bank holiday insights')}</h2>${intro}${matchesSection}${nonMatchesSection}</section>`;
  }

  function handleLeaveReportPrint({
    elements,
    title,
    scheduleLabel,
    compressedDayHours,
    compressedLabel,
    bankHolidayNote,
    bookerReport,
  }) {
    if (!elements) return;
    const payload = createLeaveReportPayload(elements, compressedDayHours);
    if (!payload.hasValues) {
      showAlert('Enter allowance values before creating a PDF report.');
      return;
    }

    const generatedLabel = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date());
    const startLabel = payload.startDate ? formatHumanDate(payload.startDate) : 'Not provided';
    const escapedTitle = escapeHtml(title);
    const escapedScheduleLabel = escapeHtml(scheduleLabel);
    const escapedStartLabel = escapeHtml(startLabel);
    const escapedGeneratedLabel = escapeHtml(generatedLabel);

    const breakdownRows = payload.components
      .map(
        (component) =>
          `<tr><td>${escapeHtml(component.label)}</td><td class="value-cell">${escapeHtml(
            formatDaysDisplay(component.value)
          )}</td></tr>`
      )
      .join('');

    const totalsRows = [
      `<tr><th scope="row">Total standard leave</th><td class="value-cell">${escapeHtml(
        formatDaysDisplay(payload.totalDaysValue)
      )}</td></tr>`,
      `<tr><th scope="row">Total allowance</th><td class="value-cell">${escapeHtml(
        formatHoursDisplay(payload.totalHoursValue)
      )}</td></tr>`,
      `<tr><th scope="row">${escapeHtml(compressedLabel)}</th><td class="value-cell">${escapeHtml(
        formatDaysDisplay(payload.compressedAllowanceValue)
      )}</td></tr>`,
    ].join('');

    const includedComponents = payload.components.filter((component) => component.value);
    const allowancesDetailSource = includedComponents.length
      ? includedComponents
      : payload.components;
    const allowancesDetail = allowancesDetailSource
      .map(
        (component) => `${component.label}: ${formatNumberWithPrecision(component.value)}`
      )
      .join(' + ');

    const standardHoursFormatted = formatNumberWithPrecision(getStandardDayHours(), 2);
    const compressedHoursFormatted = formatNumberWithPrecision(compressedDayHours, 2);
    const totalDaysFormatted = formatNumberWithPrecision(payload.totalDaysValue, 2);
    const totalHoursFormatted = formatNumberWithPrecision(payload.totalHoursValue, 2);
    const compressedFormatted = formatNumberWithPrecision(payload.compressedAllowanceValue, 2);

    const calculationItems = [
      `Total standard leave (days) = ${allowancesDetail || '0'}.`,
      `Total allowance (hours) = ${totalDaysFormatted} × ${standardHoursFormatted} = ${totalHoursFormatted} hours.`,
      `Compressed allowance (days) = ${totalHoursFormatted} ÷ ${compressedHoursFormatted} = ${compressedFormatted} days.`,
      'Purchased leave and bank holidays are treated as whole days.',
    ]
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');

    const bankHolidayNoteMarkup = bankHolidayNote
      ? `<p class="note">${escapeHtml(bankHolidayNote)}</p>`
      : '';

    const bookerSection = bookerReport ? buildBookerReportSection(bookerReport) : '';

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        margin: 0;
        padding: 2.5rem;
        background-color: #f9fafb;
        color: #111827;
      }
      header {
        margin-bottom: 1.5rem;
      }
      h1 {
        font-size: 1.75rem;
        margin: 0 0 0.25rem;
      }
      .meta {
        color: #4b5563;
        margin: 0.25rem 0;
      }
      h2 {
        font-size: 1.25rem;
        margin-bottom: 0.75rem;
      }
      .section {
        margin-top: 2rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        overflow: hidden;
      }
      thead {
        background-color: #f3f4f6;
      }
      th,
      td {
        text-align: left;
        padding: 0.75rem;
        border-bottom: 1px solid #e5e7eb;
      }
      th {
        font-weight: 600;
      }
      tbody tr:last-child td {
        border-bottom: none;
      }
      .value-cell {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      dl {
        display: grid;
        grid-template-columns: minmax(160px, 220px) 1fr;
        gap: 0.5rem 1rem;
        margin: 0;
      }
      dt {
        font-weight: 600;
      }
      dd {
        margin: 0;
      }
      ul {
        margin: 0.75rem 0 0;
        padding-left: 1.25rem;
      }
      .list-section {
        margin-top: 1.5rem;
      }
      .subheading {
        font-size: 1.1rem;
        margin: 0 0 0.5rem;
      }
      .event-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.75rem;
      }
      .event-item {
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        background: #ffffff;
        padding: 0.75rem;
      }
      .event-item__title {
        margin: 0 0 0.25rem;
        font-weight: 600;
      }
      .event-item__meta {
        margin: 0;
        color: #4b5563;
        font-size: 0.9rem;
      }
      .event-item__notes {
        margin: 0.35rem 0 0;
        color: #6b7280;
        font-size: 0.85rem;
      }
      .event-item--empty {
        border-style: dashed;
        text-align: left;
        color: #6b7280;
        background: #f9fafb;
      }
      .note {
        margin-top: 0.75rem;
        color: #374151;
      }
      footer {
        margin-top: 2.5rem;
        font-size: 0.9rem;
        color: #6b7280;
      }
      @media print {
        @page {
          margin-top: 0;
          margin-bottom: 0;
        }
        body {
          padding: 2rem;
          background: #ffffff;
        }
        table {
          page-break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapedTitle}</h1>
      <p class="meta">Generated ${escapedGeneratedLabel}</p>
    </header>
    <section class="section">
      <h2>Overview</h2>
      <dl>
        <dt>Leave pattern</dt>
        <dd>${escapedScheduleLabel}</dd>
        <dt>Start date</dt>
        <dd>${escapedStartLabel}</dd>
      </dl>
    </section>
    <section class="section">
      <h2>Leave inputs</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Allowance</th>
            <th scope="col" class="value-cell">Value</th>
          </tr>
        </thead>
        <tbody>
          ${breakdownRows}
        </tbody>
      </table>
    </section>
    <section class="section">
      <h2>Calculated totals</h2>
      <table>
        <tbody>
          ${totalsRows}
        </tbody>
      </table>
    </section>
    <section class="section">
      <h2>Calculation details</h2>
      <ul>
        ${calculationItems}
      </ul>
      ${bankHolidayNoteMarkup}
    </section>
    ${bookerSection}
  </body>
</html>`;

    openPrintWindowWithHtml(html, title);
  }

  function updateFourDayWeekBankHolidayDefault({ force = false } = {}) {
    const elements = getFourDayWeekElements();
    if (!elements) return;
    const { start, bankHolidays, bankHolidayHelp } = elements;
    if (!start || !bankHolidays) return;

    const startValue = start.value;
    if (!startValue) {
      fourDayWeekState.lastDefault = null;
      if (!fourDayWeekState.userOverriddenBankHolidays || force) {
        bankHolidays.value = '';
      }
      if (bankHolidayHelp)
        bankHolidayHelp.textContent = 'Select a start date to automatically calculate bank holidays.';
      return;
    }

    const computed = computeFinancialYearBankHolidayDefault(new Date(startValue));
    fourDayWeekState.lastDefault = computed;

    if ((!fourDayWeekState.userOverriddenBankHolidays || force) && computed) {
      bankHolidays.value = String(computed.count);
    } else if (!computed && (force || !fourDayWeekState.userOverriddenBankHolidays)) {
      bankHolidays.value = '';
    }

    if (bankHolidayHelp) {
      if (!bankHolidayState.events.length) {
        bankHolidayHelp.textContent = 'Bank holiday data is unavailable. Refresh from the Bank Holidays page to load the latest information.';
      } else if (!computed) {
        bankHolidayHelp.textContent = 'Unable to determine the organisational working year for the selected start date.';
      } else {
        const { count, effectiveStart, rangeEnd } = computed;
        const startLabel = formatHumanDate(effectiveStart);
        const endLabel = formatHumanDate(rangeEnd);
        bankHolidayHelp.textContent = `Counting ${count} bank holidays remaining between ${startLabel} and ${endLabel} in this organisational working year.`;
      }
    }
  }

  function updateNineDayFortnightBankHolidayDefault({ force = false } = {}) {
    const elements = getNineDayFortnightElements();
    if (!elements) return;
    const { start, bankHolidays, bankHolidayHelp } = elements;
    if (!start || !bankHolidays) return;

    const startValue = start.value;
    if (!startValue) {
      nineDayFortnightState.lastDefault = null;
      if (!nineDayFortnightState.userOverriddenBankHolidays || force) {
        bankHolidays.value = '';
      }
      if (bankHolidayHelp)
        bankHolidayHelp.textContent = 'Select a start date to automatically calculate bank holidays.';
      return;
    }

    const computed = computeFinancialYearBankHolidayDefault(new Date(startValue));
    nineDayFortnightState.lastDefault = computed;

    if ((!nineDayFortnightState.userOverriddenBankHolidays || force) && computed) {
      bankHolidays.value = String(computed.count);
    } else if (!computed && (force || !nineDayFortnightState.userOverriddenBankHolidays)) {
      bankHolidays.value = '';
    }

    if (bankHolidayHelp) {
      if (!bankHolidayState.events.length) {
        bankHolidayHelp.textContent =
          'Bank holiday data is unavailable. Refresh from the Bank Holidays page to load the latest information.';
      } else if (!computed) {
        bankHolidayHelp.textContent = 'Unable to determine the organisational working year for the selected start date.';
      } else {
        const { count, effectiveStart, rangeEnd } = computed;
        const startLabel = formatHumanDate(effectiveStart);
        const endLabel = formatHumanDate(rangeEnd);
        bankHolidayHelp.textContent = `Counting ${count} bank holidays remaining between ${startLabel} and ${endLabel} in this organisational working year.`;
      }
    }
  }

  function updateNineDayFortnightBooker() {
    const booker = getNineDayFortnightBookerElements();
    if (!booker) return;
    const {
      startDate,
      message,
      results,
      matchesLabel,
      matchesList,
      nonMatchesLabel,
      nonMatchesList,
    } = booker;

    if (matchesList) matchesList.innerHTML = '';
    if (nonMatchesList) nonMatchesList.innerHTML = '';
    if (results) results.hidden = true;

    if (!bankHolidayState.events.length) {
      if (message) {
        message.textContent =
          'Bank holiday data is unavailable. Refresh from the Bank Holidays page to load the latest information.';
      }
      return;
    }

    const startValue = startDate ? startDate.value : '';
    if (!startValue) {
      if (message) {
        message.textContent = 'Pick the first non-working day to begin the every other week pattern.';
      }
      return;
    }

    const start = toStartOfDay(startValue);
    if (!start) {
      if (message) {
        message.textContent = 'Enter a valid first non-working day to continue.';
      }
      return;
    }

    const range = getFinancialYearRange(start);
    if (!range) {
      if (message) {
        message.textContent = 'Unable to determine the organisational working year for the selected date.';
      }
      return;
    }

    const windowEnd = new Date(range.end.getTime());
    if (start.getTime() > windowEnd.getTime()) {
      if (message) {
        message.textContent = 'No dates in range.';
      }
      return;
    }

    const patternDates = new Set();
    for (let cursor = new Date(start.getTime()); cursor.getTime() <= windowEnd.getTime(); cursor.setDate(cursor.getDate() + 14)) {
      patternDates.add(toDateKey(cursor));
    }

    const eventsInWindow = bankHolidayState.events
      .map((event) => {
        const eventDate = toStartOfDay(event.date);
        if (!eventDate) return null;
        return {
          title: event.title,
          notes: event.notes,
          date: eventDate,
          key: toDateKey(eventDate),
        };
      })
      .filter(
        (event) =>
          event &&
          event.date.getTime() >= start.getTime() &&
          event.date.getTime() <= windowEnd.getTime()
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const matches = [];
    const nonMatches = [];

    eventsInWindow.forEach((event) => {
      if (patternDates.has(event.key)) {
        matches.push(event);
      } else {
        nonMatches.push(event);
      }
    });

    const renderList = (listEl, items) => {
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!items.length) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'text-sm text-gray-500 dark:text-gray-400';
        emptyItem.textContent = 'None in this window.';
        listEl.appendChild(emptyItem);
        return;
      }

      items.forEach((item) => {
        const entry = document.createElement('li');
        entry.className =
          'rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 space-y-1 border border-gray-200 dark:border-gray-700';
        const title = document.createElement('p');
        title.className = 'font-medium text-gray-900 dark:text-gray-100';
        title.textContent = item.title || 'Bank holiday';
        entry.appendChild(title);
        const dateLine = document.createElement('p');
        dateLine.className = 'text-xs text-gray-600 dark:text-gray-400';
        dateLine.textContent = formatBankHolidayDate(item.date);
        entry.appendChild(dateLine);
        if (item.notes) {
          const notes = document.createElement('p');
          notes.className = 'text-xs text-gray-500 dark:text-gray-400';
          notes.textContent = item.notes;
          entry.appendChild(notes);
        }
        listEl.appendChild(entry);
      });
    };

    if (matchesLabel) {
      matchesLabel.textContent = `Bank holidays on non-working days (${matches.length})`;
    }
    if (nonMatchesLabel) {
      nonMatchesLabel.textContent = `Other bank holidays in range (${nonMatches.length})`;
    }

    renderList(matchesList, matches);
    renderList(nonMatchesList, nonMatches);

    if (message) {
      const startLabel = formatHumanDate(start);
      const endLabel = formatHumanDate(windowEnd);
      if (matches.length) {
        message.textContent = `Found ${matches.length} bank holidays on the every other week pattern between ${startLabel} and ${endLabel}.`;
      } else if (eventsInWindow.length) {
        message.textContent = `No bank holidays align with this every other week pattern between ${startLabel} and ${endLabel}. Showing other bank holidays for reference.`;
      } else {
        message.textContent = `No bank holidays fall between ${startLabel} and ${endLabel}.`;
      }
    }

    if (results) {
      results.hidden = false;
    }
  }

  function initializeFourDayWeek() {
    if (fourDayWeekState.initialized) return;
    const elements = getFourDayWeekElements();
    if (!elements) return;
    const booker = getBankHolidayBookerElements();

    const { start, core, longService, carryOver, purchased, bankHolidays } = elements;
    const bookerDaySelect = booker ? booker.daySelect : null;

    if (start && !start.value) {
      start.value = formatDateForInput(new Date());
    }

    const handleInputChange = () => {
      updateFourDayWeekSummary();
    };

    [core, longService, carryOver, purchased].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', handleInputChange);
    });

    if (bankHolidays) {
      bankHolidays.addEventListener('input', () => {
        fourDayWeekState.userOverriddenBankHolidays = true;
        updateFourDayWeekSummary();
      });
    }

    if (start) {
      start.addEventListener('change', () => {
        fourDayWeekState.userOverriddenBankHolidays = false;
        updateFourDayWeekBankHolidayDefault({ force: true });
        updateFourDayWeekSummary();
        updateBankHolidayBooker();
      });
    }

    if (bookerDaySelect) {
      bookerDaySelect.addEventListener('change', () => {
        updateBankHolidayBooker();
      });
    }

    fourDayWeekState.initialized = true;
    updateFourDayWeekBankHolidayDefault({ force: true });
    updateFourDayWeekSummary();
    updateBankHolidayBooker();
  }

  function initializeNineDayFortnight() {
    if (nineDayFortnightState.initialized) return;
    const elements = getNineDayFortnightElements();
    if (!elements) return;
    const booker = getNineDayFortnightBookerElements();

    const { start, core, longService, carryOver, purchased, bankHolidays } = elements;
    const bookerStartInput = booker ? booker.startDate : null;

    if (start && !start.value) {
      start.value = formatDateForInput(new Date());
    }

    if (bookerStartInput && !bookerStartInput.value) {
      bookerStartInput.value = formatDateForInput(new Date());
    }

    const handleInputChange = () => {
      updateNineDayFortnightSummary();
    };

    [core, longService, carryOver, purchased].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', handleInputChange);
    });

    if (bankHolidays) {
      bankHolidays.addEventListener('input', () => {
        nineDayFortnightState.userOverriddenBankHolidays = true;
        updateNineDayFortnightSummary();
      });
    }

    if (start) {
      start.addEventListener('change', () => {
        nineDayFortnightState.userOverriddenBankHolidays = false;
        updateNineDayFortnightBankHolidayDefault({ force: true });
        updateNineDayFortnightSummary();
      });
    }

    if (bookerStartInput) {
      bookerStartInput.addEventListener('change', () => {
        updateNineDayFortnightBooker();
      });
    }

    nineDayFortnightState.initialized = true;
    updateNineDayFortnightBankHolidayDefault({ force: true });
    updateNineDayFortnightSummary();
    updateNineDayFortnightBooker();
  }

  function updateLeaveYearInputs() {
    const range = getCurrentLeaveYearRange();
    const startInput = document.getElementById('leaveYearStartInput');
    const endInput = document.getElementById('leaveYearEndInput');
    if (startInput) {
      startInput.value = range ? formatDateForInput(range.start) : '';
    }
    if (endInput) {
      endInput.value = range ? formatDateForInput(range.end) : '';
    }
  }

  function refreshLeaveYearCopy() {
    const range = getCurrentLeaveYearRange();
    const fullRange = range ? formatLeaveYearRange(range) : '';

    const startMessage = fullRange
      ? `Used to determine the organisational working year (${fullRange}) and remaining bank holidays.`
      : 'Used to determine the organisational working year and remaining bank holidays.';
    $$('[data-leave-year-start-note]').forEach((el) => {
      el.textContent = startMessage;
    });

    const bookerIntroMessage = fullRange
      ? `Pick the regular non-working day to see which bank holidays still fall on it before the end of the organisational working year (${fullRange}).`
      : 'Pick the regular non-working day to see which bank holidays still fall on it before the end of the organisational working year.';
    $$('[data-leave-year-booker-intro]').forEach((el) => {
      el.textContent = bookerIntroMessage;
    });

    const bookerHintMessage = fullRange
      ? `We'll use the start date above to work out the rest of the organisational working year (${fullRange}).`
      : "We'll use the start date above to work out the rest of the organisational working year.";
    $$('[data-leave-year-booker-hint]').forEach((el) => {
      el.textContent = bookerHintMessage;
    });

    const nineIntroMessage = fullRange
      ? `Choose the first non-working day in your every other week pattern to spot overlapping bank holidays in this organisational working year (${fullRange}).`
      : 'Choose the first non-working day in your every other week pattern to spot overlapping bank holidays.';
    $$('[data-leave-year-nine-booker-intro]').forEach((el) => {
      el.textContent = nineIntroMessage;
    });

    const nineHintMessage = fullRange
      ? `We'll use the configured organisational working year (${fullRange}) to work out the matching range.`
      : "We'll use the configured organisational working year to work out the matching range.";
    $$('[data-leave-year-nine-booker-hint]').forEach((el) => {
      el.textContent = nineHintMessage;
    });

    const settingsNote = fullRange
      ? `Choose when the organisational working year begins. We'll apply the selected month and day every year and calculate the end date automatically. Current cycle: ${fullRange}.`
      : "Choose when the organisational working year begins. We'll apply the selected month and day every year and calculate the end date automatically.";
    $$('[data-leave-year-settings-note]').forEach((el) => {
      el.textContent = settingsNote;
    });

    const settingsHelp = fullRange
      ? `Example shown using today's cycle (${fullRange}).`
      : "Example shown using today's cycle.";
    $$('[data-leave-year-settings-help]').forEach((el) => {
      el.textContent = settingsHelp;
    });

  }

  function initializeSettingsControls() {
    updateLeaveYearInputs();
    refreshLeaveYearCopy();

    const startInput = document.getElementById('leaveYearStartInput');
    const endInput = document.getElementById('leaveYearEndInput');
    if (endInput) {
      endInput.readOnly = true;
      endInput.setAttribute('aria-readonly', 'true');
    }

    if (startInput) {
      startInput.addEventListener('change', () => {
        const parsed = toStartOfDay(startInput.value);
        if (!parsed) {
          updateLeaveYearInputs();
          refreshLeaveYearCopy();
          return;
        }
        setLeaveYearStart({ month: parsed.getMonth() + 1, day: parsed.getDate() });
        updateLeaveYearInputs();
        refreshLeaveYearCopy();
        renderBankHolidays({ updateYears: true });
        fourDayWeekState.userOverriddenBankHolidays = false;
        nineDayFortnightState.userOverriddenBankHolidays = false;
        updateFourDayWeekBankHolidayDefault({ force: true });
        updateFourDayWeekSummary();
        updateBankHolidayBooker();
        updateNineDayFortnightBankHolidayDefault({ force: true });
        updateNineDayFortnightSummary();
        updateNineDayFortnightBooker();
      });
    }

    const applyHoursInput = (input, getter, setter, onChange) => {
      if (!input) return;
      const writeValue = () => {
        const value = getter();
        input.value = Number.isFinite(value) ? value.toString() : '';
      };
      writeValue();
      input.addEventListener('change', () => {
        const nextValue = setter(input.value);
        input.value = Number.isFinite(nextValue) ? nextValue.toString() : '';
        if (typeof onChange === 'function') onChange();
      });
      input.addEventListener('blur', writeValue);
    };

    const standardHoursInput = document.getElementById('standardDayHoursInput');
    const fourDayHoursInput = document.getElementById('fourDayCompressedHoursInput');
    const nineDayHoursInput = document.getElementById('nineDayCompressedHoursInput');

    applyHoursInput(standardHoursInput, getStandardDayHours, (value) =>
      setStandardDayHours(value), () => {
        updateFourDayWeekSummary();
        updateNineDayFortnightSummary();
      });

    applyHoursInput(fourDayHoursInput, getFourDayCompressedHours, (value) =>
      setFourDayCompressedHours(value), () => {
        updateFourDayWeekSummary();
      });

    applyHoursInput(nineDayHoursInput, getNineDayCompressedHours, (value) =>
      setNineDayCompressedHours(value), () => {
        updateNineDayFortnightSummary();
      });
  }

  function setBankHolidaysLoading(loading) {
    const elements = getBankHolidayElements();
    if (!elements) return;
    bankHolidaysLoading = !!loading;
    if (elements.loading) elements.loading.classList.toggle('hidden', !loading);
    const { refresh } = elements;
    if (refresh) {
      const defaultLabel =
        refresh.dataset.defaultLabel || refresh.textContent.trim() || 'Refresh data';
      if (!refresh.dataset.defaultLabel) refresh.dataset.defaultLabel = defaultLabel;
      refresh.disabled = loading;
      refresh.setAttribute('aria-busy', loading ? 'true' : 'false');
      refresh.textContent = loading ? 'Refreshing…' : refresh.dataset.defaultLabel;
    }
  }

  function renderBankHolidays({ updateYears = false } = {}) {
    const elements = getBankHolidayElements();
    if (!elements) return;
    const { list, yearSelect, empty, error, rangeInfo } = elements;
    if (error) error.classList.add('hidden');
    if (!list || !yearSelect) return;

    const events = bankHolidayState.events.slice();
    const currentFinancialYear = getFinancialYearRange(new Date());
    const currentFinancialYearStart = currentFinancialYear
      ? currentFinancialYear.start.getFullYear()
      : new Date().getFullYear();

    const displayableEvents = events.filter((event) => {
      const startYear = getFinancialYearStartYear(event.date);
      if (startYear === null) return false;
      return startYear >= currentFinancialYearStart;
    });

    if (updateYears) {
      const years = Array.from(
        new Set(
          displayableEvents
            .map((event) => getFinancialYearStartYear(event.date))
            .filter((year) => year !== null)
        )
      ).sort((a, b) => a - b);

      yearSelect.innerHTML = '';

      if (!years.length) {
        yearSelect.disabled = true;
        bankHolidayState.selectedYear = null;
        yearSelect.value = '';
      } else {
        yearSelect.disabled = false;
        const preferred = years.includes(currentFinancialYearStart)
          ? currentFinancialYearStart
          : years[years.length - 1];
        const previous = bankHolidayState.selectedYear
          ? Number.parseInt(bankHolidayState.selectedYear, 10)
          : null;
        const resolved = previous && years.includes(previous) ? previous : preferred;
        bankHolidayState.selectedYear = String(resolved);

        years.forEach((year) => {
          const option = document.createElement('option');
          option.value = String(year);
          option.textContent = formatFinancialYearLabel(year);
          if (year === resolved) option.selected = true;
          yearSelect.appendChild(option);
        });
      }
    } else if (yearSelect.value) {
      bankHolidayState.selectedYear = yearSelect.value;
    }

    list.innerHTML = '';
    const selectedStartYear = Number.parseInt(bankHolidayState.selectedYear || '', 10);

    if (rangeInfo) {
      const rangeForDisplay = Number.isNaN(selectedStartYear)
        ? getCurrentLeaveYearRange()
        : (() => {
            const start = getLeaveYearStartDateForYear(selectedStartYear);
            const end = getLeaveYearEndDateForYear(selectedStartYear);
            return start && end ? { start, end } : null;
          })();
      const label = rangeForDisplay ? formatLeaveYearRange(rangeForDisplay) : '';
      rangeInfo.textContent = label
        ? `Showing organisational working year: ${label}.`
        : 'Set the organisational working year in Settings to view matching bank holidays.';
    }

    const filtered = Number.isNaN(selectedStartYear)
      ? displayableEvents
      : displayableEvents.filter((event) => {
          const startYear = getFinancialYearStartYear(event.date);
          return startYear !== null && startYear === selectedStartYear;
        });

    if (!filtered.length) {
      if (empty) empty.classList.remove('hidden');
      updateFourDayWeekBankHolidayDefault();
      updateFourDayWeekSummary();
      updateBankHolidayBooker();
      updateNineDayFortnightBankHolidayDefault();
      updateNineDayFortnightSummary();
      updateNineDayFortnightBooker();
      return;
    }

    if (empty) empty.classList.add('hidden');

    filtered.forEach((event) => {
      const wrapper = document.createElement('div');
      wrapper.className =
        'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4 space-y-2';
      const title = document.createElement('p');
      title.className = 'font-semibold text-gray-900 dark:text-gray-100';
      title.textContent = event.title || 'Bank holiday';
      wrapper.appendChild(title);
      const dateLine = document.createElement('p');
      dateLine.className = 'text-sm text-gray-600 dark:text-gray-400';
      dateLine.textContent = formatBankHolidayDate(event.date);
      wrapper.appendChild(dateLine);
      if (event.notes) {
        const notes = document.createElement('p');
        notes.className = 'text-sm text-gray-500 dark:text-gray-400';
        notes.textContent = event.notes;
        wrapper.appendChild(notes);
      }
      list.appendChild(wrapper);
    });

    updateFourDayWeekBankHolidayDefault();
    updateFourDayWeekSummary();
    updateBankHolidayBooker();
    updateNineDayFortnightBankHolidayDefault();
    updateNineDayFortnightSummary();
    updateNineDayFortnightBooker();
  }

  async function refreshBankHolidays({ showConfirmationOnSuccess = false } = {}) {
    if (bankHolidaysLoading) return;
    const elements = getBankHolidayElements();
    if (!elements) return;
    setBankHolidaysLoading(true);
    if (elements.error) elements.error.classList.add('hidden');
    try {
      const response = await fetch(BANK_HOLIDAYS_ENDPOINT, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const payload = await response.json();
      const events = parseBankHolidayEvents(payload);
      bankHolidayState.events = events.slice();
      bankHolidayState.fetchedAt = new Date().toISOString();
      storeBankHolidays(bankHolidayState);
      renderBankHolidays({ updateYears: true });
      if (showConfirmationOnSuccess) {
        const savedCount = events.length;
        let message = 'Bank holiday data refreshed.';
        if (savedCount === 0) {
          message = 'Bank holiday data refreshed, but no upcoming bank holidays were returned.';
        }
        showAlert(message);
      }
    } catch (error) {
      console.error('Unable to refresh bank holidays', error);
      if (elements.error) elements.error.classList.remove('hidden');
      if (elements.empty) elements.empty.classList.add('hidden');
    } finally {
      setBankHolidaysLoading(false);
    }
  }

  function initializeBankHolidays() {
    const elements = getBankHolidayElements();
    if (!elements) return;

    const stored = loadStoredBankHolidays();
    if (stored) {
      bankHolidayState.events = stored.events.slice();
      bankHolidayState.fetchedAt = stored.fetchedAt || null;
      renderBankHolidays({ updateYears: true });
      if (!bankHolidayState.events.length) {
        void refreshBankHolidays();
      }
    } else {
      renderBankHolidays({ updateYears: true });
      void refreshBankHolidays();
    }

    if (elements.yearSelect) {
      elements.yearSelect.addEventListener('change', () => {
        bankHolidayState.selectedYear = elements.yearSelect.value;
        renderBankHolidays();
      });
    }
  }

  function setSidebarOpen(open) {
    const sidebar = $('#sidebar');
    const overlay = $('#overlay');
    if (!sidebar) return;
    if (open) {
      sidebar.classList.remove('-translate-x-full');
      body.classList.add('mobile-nav-open');
      if (overlay) overlay.classList.remove('hidden');
    } else {
      sidebar.classList.add('-translate-x-full');
      body.classList.remove('mobile-nav-open');
      if (overlay) overlay.classList.add('hidden');
    }
  }

  function toggleSidebar() {
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    const isHidden = sidebar.classList.contains('-translate-x-full');
    setSidebarOpen(isHidden);
  }

  function waitForState(worker, desiredState) {
    return new Promise((resolve, reject) => {
      if (!worker) {
        resolve(false);
        return;
      }
      if (worker.state === desiredState) {
        resolve(true);
        return;
      }
      const handle = () => {
        if (worker.state === desiredState) {
          worker.removeEventListener('statechange', handle);
          resolve(true);
        } else if (worker.state === 'redundant') {
          worker.removeEventListener('statechange', handle);
          reject(new Error('Service worker became redundant before reaching state.'));
        }
      };
      worker.addEventListener('statechange', handle);
    });
  }

  let modalCloseHandler = null;
  let modalReturnFocus = null;

  function closeModal() {
    const modal = document.getElementById('modal');
    if (!modal || modal.classList.contains('modal-hidden')) return;
    const modalBody = modal.querySelector('#modal-body');
    if (modalBody) modalBody.classList.remove('text-center');
    modal.classList.add('modal-hidden');
    modal.setAttribute('aria-hidden', 'true');
    const handler = modalCloseHandler;
    modalCloseHandler = null;
    const focusTarget = modalReturnFocus;
    modalReturnFocus = null;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (_) {
        focusTarget.focus();
      }
    }
    if (typeof handler === 'function') handler();
  }

  function showAlert(content, onClose) {
    const modal = document.getElementById('modal');
    const modalBody = modal ? modal.querySelector('#modal-body') : null;
    if (!modal || !modalBody) {
      const fallback =
        typeof content === 'string'
          ? content
          : content && typeof content.textContent === 'string'
          ? content.textContent
          : '';
      window.alert(fallback);
      if (typeof onClose === 'function') onClose();
      return;
    }
    modalBody.innerHTML = '';
    modalBody.classList.add('text-center');
    if (content instanceof Node) {
      modalBody.appendChild(content);
    } else if (typeof content === 'string') {
      const paragraph = document.createElement('p');
      paragraph.className = 'text-base text-gray-700 dark:text-gray-200';
      paragraph.textContent = content;
      modalBody.appendChild(paragraph);
    }
    const footer = document.createElement('div');
    footer.className = 'mt-6 flex justify-center';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn btn-blue';
    closeButton.dataset.action = 'close-modal';
    closeButton.textContent = 'Close';
    footer.appendChild(closeButton);
    modalBody.appendChild(footer);

    modal.classList.remove('modal-hidden');
    modal.setAttribute('aria-hidden', 'false');
    modalCloseHandler = typeof onClose === 'function' ? onClose : null;
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = modal.querySelector('[data-action="close-modal"]');
    if (focusable instanceof HTMLElement) {
      focusable.focus();
    }
  }

  function showConfirm({
    message = 'Are you sure?',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal');
      const modalBody = modal ? modal.querySelector('#modal-body') : null;
      if (!modal || !modalBody) {
        const fallback = window.confirm(message);
        resolve(fallback);
        return;
      }

      modalBody.classList.remove('text-center');
      modalBody.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'modal-confirm';

      const text = document.createElement('p');
      text.textContent = message;
      wrapper.appendChild(text);

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.className = 'btn btn-red';
      confirmButton.textContent = confirmLabel;

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'btn btn-gray';
      cancelButton.textContent = cancelLabel;

      actions.appendChild(confirmButton);
      actions.appendChild(cancelButton);
      wrapper.appendChild(actions);
      modalBody.appendChild(wrapper);

      let settled = false;
      const finalize = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      modalCloseHandler = () => finalize(false);
      modalReturnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      modal.classList.remove('modal-hidden');
      modal.setAttribute('aria-hidden', 'false');

      confirmButton.addEventListener('click', () => {
        if (settled) return;
        modalCloseHandler = null;
        closeModal();
        finalize(true);
      });

      cancelButton.addEventListener('click', () => {
        if (settled) return;
        modalCloseHandler = null;
        closeModal();
        finalize(false);
      });

      const closeButton = modal.querySelector('[data-action="close-modal"]');
      if (closeButton instanceof HTMLElement) {
        closeButton.classList.remove('hidden');
      }

      confirmButton.focus();
    });
  }

  async function handleAppUpdateRequest(button) {
    if (!button) return;
    const defaultLabel =
      button.getAttribute('data-default-label') || button.textContent.trim();
    button.setAttribute('data-default-label', defaultLabel);
    const busyTemplate = (label) =>
      `<span class="flex items-center justify-center gap-2">
        <span
          class="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        ></span>
        <span>${label}</span>
      </span>`;
    const setBusy = (label) => {
      button.innerHTML = busyTemplate(label);
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    };
    const reset = () => {
      button.textContent = defaultLabel;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    };

    setBusy('Checking…');

    let updateResolved = false;
    let timeoutId = null;

    const cancelTimeout = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const markResolved = () => {
      if (updateResolved) return false;
      updateResolved = true;
      cancelTimeout();
      return true;
    };

    const finishWithMessage = (message, { reload = false } = {}) => {
      if (!markResolved()) return;
      reset();
      try {
        button.focus({ preventScroll: true });
      } catch (_) {
        button.focus();
      }
      showAlert(message, reload ? () => window.location.reload() : null);
    };

    if (!('serviceWorker' in navigator)) {
      finishWithMessage(
        "Automatic updates aren't supported in this browser. Please refresh manually to get the latest version.",
      );
      return;
    }

    const waitForRegistration = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) return registration;
      } catch (_) {
        /* ignore */
      }
      try {
        return await navigator.serviceWorker.ready;
      } catch (_) {
        return null;
      }
    };

    const waitForNewWorker = (registration) =>
      new Promise((resolve) => {
        if (registration.installing) {
          resolve(registration.installing);
          return;
        }
        const handleUpdateFound = () => {
          const worker = registration.installing || registration.waiting || null;
          if (!worker) return;
          registration.removeEventListener('updatefound', handleUpdateFound);
          resolve(worker);
        };
        registration.addEventListener('updatefound', handleUpdateFound);
        setTimeout(() => {
          registration.removeEventListener('updatefound', handleUpdateFound);
          resolve(registration.installing || registration.waiting || null);
        }, 10000);
      });

    const waitForControllerChange = () =>
      new Promise((resolve) => {
        let resolvedChange = false;
        const finish = () => {
          if (resolvedChange) return;
          resolvedChange = true;
          navigator.serviceWorker.removeEventListener('controllerchange', finish);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', finish);
        setTimeout(finish, 5000);
      });

    const applyUpdate = async (worker) => {
      if (!worker || updateResolved) return updateResolved;
      try {
        setBusy('Downloading update…');
        await waitForState(worker, 'installed');
      } catch (err) {
        console.error('Update install failed', err);
        finishWithMessage("We couldn't finish installing the update. Please try again later.");
        return true;
      }

      try {
        setBusy('Installing update…');
        const controllerChanged = waitForControllerChange();
        try {
          worker.postMessage({ type: 'SKIP_WAITING' });
        } catch (err) {
          console.error('Failed to notify service worker', err);
        }
        await waitForState(worker, 'activated');
        setBusy('Finalizing update…');
        await controllerChanged;
      } catch (err) {
        console.error('Update activation failed', err);
        finishWithMessage("We couldn't activate the update. Please try again later.");
        return true;
      }

      finishWithMessage('LeaveTrack has been updated to the latest version.', {
        reload: true,
      });
      return true;
    };

    timeoutId = setTimeout(() => {
      console.warn('Update request timed out after 30 seconds');
      finishWithMessage('Checking for updates failed. Please try again later.');
    }, 30000);

    try {
      const registration = await waitForRegistration();
      if (!registration) {
        finishWithMessage(
          "We couldn't reach the update service. Please refresh manually to check for updates.",
        );
        return;
      }

      if (await applyUpdate(registration.waiting)) return;

      if (registration.installing) {
        const handled = await applyUpdate(registration.installing);
        if (handled) return;
      }

      const newWorkerPromise = waitForNewWorker(registration);
      try {
        await registration.update();
      } catch (err) {
        console.error('Service worker update failed', err);
      }

      const newWorker = await newWorkerPromise;
      if (await applyUpdate(newWorker)) return;

      finishWithMessage("You're already using the latest version of LeaveTrack.");
    } catch (error) {
      console.error('Update check failed', error);
      finishWithMessage("We couldn't complete the update check. Please try again later.");
    }
  }

  function navigateTo(targetId) {
    const section = document.getElementById(targetId);
    if (!section) return;
    $$('.content-section').forEach((el) => {
      el.classList.toggle('active', el === section);
    });
    $$('#sidebar .nav-btn').forEach((btn) => {
      const isActive = btn.dataset.target === targetId;
      btn.classList.toggle('active-nav-button', isActive);
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
    safeSet(LS_KEYS.view, targetId);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  async function renderChangelog() {
    const card = document.getElementById('changelogCard');
    if (!card) return;
    const list = card.querySelector('[data-changelog-list]');
    if (!list) return;
    const emptyState = card.querySelector('[data-changelog-empty]');
    const errorState = card.querySelector('[data-changelog-error]');
    list.innerHTML = '';
    if (emptyState) emptyState.classList.add('hidden');
    if (errorState) errorState.classList.add('hidden');

    try {
      const response = await fetch('assets/changelog.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch changelog');
      const entries = await response.json();
      if (!Array.isArray(entries) || !entries.length) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }
      entries
        .slice()
        .sort((a, b) => {
          const av = String(a?.version || '');
          const bv = String(b?.version || '');
          return bv.localeCompare(av, undefined, { numeric: true, sensitivity: 'base' });
        })
        .slice(0, 5)
        .forEach((entry) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'space-y-2';
          const heading = document.createElement('p');
          heading.className = 'font-semibold text-gray-900 dark:text-gray-100';
          const formattedDate = (() => {
            if (!entry?.date) return '';
            const date = new Date(entry.date);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
          })();
          heading.textContent = formattedDate
            ? `Version ${entry.version}: ${formattedDate}`
            : `Version ${entry.version}`;
          wrapper.appendChild(heading);
          const changeList = document.createElement('ul');
          changeList.className = 'list-disc pl-5 space-y-1 text-sm text-gray-700 dark:text-gray-300';
          (entry?.changes || []).forEach((change) => {
            const item = document.createElement('li');
            item.textContent = change;
            changeList.appendChild(item);
          });
          wrapper.appendChild(changeList);
          list.appendChild(wrapper);
        });
    } catch (error) {
      console.error('Unable to load changelog', error);
      if (errorState) errorState.classList.remove('hidden');
    }
  }

  async function updateVersionDisplay() {
    const targets = document.querySelectorAll('[data-app-version]');
    if (!targets.length) return;
    const applyText = (value) => {
      const label = typeof value === 'string' && value.trim() ? value.trim() : '0.0.0';
      targets.forEach((el) => {
        el.textContent = label;
      });
    };

    applyText('0.0.0');

    try {
      const response = await fetch('assets/version.json', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (!data || typeof data.version !== 'string') return;
      applyText(data.version);
    } catch (error) {
      console.error('Unable to fetch version', error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const storedTheme = safeGet(LS_KEYS.theme);
    applyDarkMode(storedTheme === '1', { persist: false });

    const themeToggle = $('#themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('change', (event) => {
        applyDarkMode(event.target.checked, { withTransition: true });
      });
    }

    const storedThemeChoice = safeGet(LS_KEYS.themeChoice) || 'default';
    applyThemeChoice(storedThemeChoice, { persist: false });
    const themeSelect = $('#themeSelect');
    if (themeSelect) {
      themeSelect.addEventListener('change', (event) => {
        applyThemeChoice(event.target.value);
      });
    }

    const storedSticky = safeGet(LS_KEYS.mobileNavSticky);
    applyMobileNavSticky(storedSticky !== '0', { persist: false });
    const stickyToggle = $('#mobileNavStickyToggle');
    if (stickyToggle) {
      stickyToggle.addEventListener('change', (event) => {
        applyMobileNavSticky(event.target.checked);
      });
    }

    const storedWelcomeHidden = safeGet(LS_KEYS.welcomeHidden) === '1';
    applyFirstTimeHidden(storedWelcomeHidden, { persist: false });
    const welcomeToggle = $('#welcomeToggle');
    if (welcomeToggle) {
      welcomeToggle.addEventListener('change', (event) => {
        applyFirstTimeHidden(!event.target.checked);
      });
    }

    const menuToggle = $('#menu-toggle');
    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    const overlay = $('#overlay');
    if (overlay) overlay.addEventListener('click', () => setSidebarOpen(false));

    const modalOverlay = document.getElementById('modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) {
          closeModal();
        }
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (body.classList.contains('mobile-nav-open')) {
        setSidebarOpen(false);
      }
      const modal = document.getElementById('modal');
      if (modal && !modal.classList.contains('modal-hidden')) {
        closeModal();
      }
    });

    const brandHome = $('#brandHome');
    if (brandHome) {
      brandHome.addEventListener('click', () => {
        const target = welcomeHiddenState ? 'settings' : 'welcome';
        navigateTo(target);
        if (window.innerWidth < 768) setSidebarOpen(false);
      });
    }

    $$('#sidebar .nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigateTo(btn.dataset.target);
      });
    });

    initializeSettingsControls();
    initializeBankHolidays();
    initializeFourDayWeek();
    initializeNineDayFortnight();

    const storedView = safeGet(LS_KEYS.view);
    const welcomeHidden = welcomeHiddenState;
    if (
      storedView &&
      document.getElementById(storedView) &&
      !(welcomeHidden && storedView === 'welcome')
    ) {
      navigateTo(storedView);
    } else {
      navigateTo(welcomeHidden ? 'settings' : 'welcome');
    }

    document.addEventListener('click', (event) => {
      const actionTarget = event.target.closest('[data-action]');
      if (!actionTarget) return;
      switch (actionTarget.dataset.action) {
        case 'go-settings':
          navigateTo('settings');
          break;
        case 'clear-data':
          void showConfirm({
            message: 'This will erase all locally stored data. Continue?',
            confirmLabel: 'Confirm',
            cancelLabel: 'Cancel',
          }).then((confirmed) => {
            if (!confirmed) return;
            try {
              localStorage.clear();
            } catch (_) {
              /* ignore */
            }
            try {
              sessionStorage.clear();
            } catch (_) {
              /* ignore */
            }
            window.location.reload();
          });
          break;
        case 'update-app':
          handleAppUpdateRequest(actionTarget);
          break;
        case 'refresh-bank-holidays':
          void refreshBankHolidays({ showConfirmationOnSuccess: true });
          break;
        case 'close-modal':
          closeModal();
          break;
        case 'print-four-day': {
          const elements = getFourDayWeekElements();
          if (!elements) return;
          const bankHolidayNote = buildBankHolidayReportNote({
            overridden: fourDayWeekState.userOverriddenBankHolidays,
            lastDefault: fourDayWeekState.lastDefault,
          });
          handleLeaveReportPrint({
            elements,
            title: '4-day week leave entitlement',
            scheduleLabel: '4-day week',
            compressedDayHours: getFourDayCompressedHours(),
            compressedLabel: 'Compressed allowance (days)',
            bankHolidayNote,
            bookerReport: getFourDayBookerReportData(),
          });
          break;
        }
        case 'print-nine-day': {
          const elements = getNineDayFortnightElements();
          if (!elements) return;
          const bankHolidayNote = buildBankHolidayReportNote({
            overridden: nineDayFortnightState.userOverriddenBankHolidays,
            lastDefault: nineDayFortnightState.lastDefault,
          });
          handleLeaveReportPrint({
            elements,
            title: '9-day fortnight leave entitlement',
            scheduleLabel: '9-day fortnight',
            compressedDayHours: getNineDayCompressedHours(),
            compressedLabel: '9-day fortnight allowance (days)',
            bankHolidayNote,
            bookerReport: getNineDayBookerReportData(),
          });
          break;
        }
        default:
          break;
      }
    });

    initializeCollapsibles();
    renderChangelog();
    updateVersionDisplay();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('service-worker.js')
        .catch((error) => console.error('Service worker registration failed:', error));
    });
  }
})();
