'use strict';

(function () {
  const LS_KEYS = {
    theme: 'themeDark',
    themeChoice: 'themeChoice',
    welcomeHidden: 'welcomeDisabled',
    mobileNavSticky: 'mobileNavSticky',
    view: 'activeView',
    collapsible: 'collapsedCards',
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

  let welcomeHiddenState = false;

  const fourDayWeekState = {
    elements: null,
    manualBankHolidayOverride: false,
    lastAutoValue: null,
    settingProgrammaticValue: false,
    lastComputedInfo: null,
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

  function parseISODateToUTC(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
    return new Date(Date.UTC(year, month, day));
  }

  function formatNumber(value, maximumFractionDigits = 2) {
    const normalized = Number.isFinite(value) ? value : 0;
    return normalized.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    });
  }

  function formatDays(value, maximumFractionDigits = 2) {
    const normalized = Number.isFinite(value) ? value : 0;
    const formatted = formatNumber(normalized, maximumFractionDigits);
    const isSingular = Math.abs(normalized - 1) < 1e-9;
    return `${formatted} ${isSingular ? 'day' : 'days'}`;
  }

  function formatBankHolidayCount(value) {
    const normalized = Number.isFinite(value) ? value : 0;
    const fractionDigits = Math.abs(normalized % 1) < 1e-9 ? 0 : 2;
    const formatted = formatNumber(normalized, fractionDigits);
    const isSingular = Math.abs(normalized - 1) < 1e-9;
    return `${formatted} bank holiday${isSingular ? '' : 's'}`;
  }

  function formatDateForDisplay(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function formatFinancialYearLabel(startYear) {
    if (!Number.isFinite(startYear)) return '';
    const endYear = startYear + 1;
    const endSuffix = String(endYear).slice(-2);
    return `${startYear}/${endSuffix}`;
  }

  function getFinancialYearBounds(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const startYear = month >= 3 ? year : year - 1;
    const start = new Date(Date.UTC(startYear, 3, 1));
    const endExclusive = new Date(Date.UTC(startYear + 1, 3, 1));
    const end = new Date(Date.UTC(startYear + 1, 2, 31));
    return {
      start,
      endExclusive,
      end,
      startYear,
      endYear: startYear + 1,
    };
  }

  function getFourDayWeekElements() {
    if (fourDayWeekState.elements) return fourDayWeekState.elements;
    const card = document.getElementById('fourDayWeekCard');
    if (!card) return null;
    const elements = {
      card,
      startDate: card.querySelector('[data-four-day-week-start]'),
      core: card.querySelector('[data-four-day-week-core]'),
      longService: card.querySelector('[data-four-day-week-long-service]'),
      carryOver: card.querySelector('[data-four-day-week-carry-over]'),
      purchased: card.querySelector('[data-four-day-week-purchased]'),
      bankHolidays: card.querySelector('[data-four-day-week-bank-holidays]'),
      status: card.querySelector('[data-four-day-week-bank-holiday-status]'),
      summaryCore: card.querySelector('[data-summary-core]'),
      summaryLongService: card.querySelector('[data-summary-long-service]'),
      summaryCarryOver: card.querySelector('[data-summary-carry-over]'),
      summaryPurchased: card.querySelector('[data-summary-purchased]'),
      summaryBankHolidays: card.querySelector('[data-summary-bank-holidays]'),
      equation: card.querySelector('[data-four-day-week-equation]'),
      totalHours: card.querySelector('[data-four-day-week-total-hours]'),
    };
    fourDayWeekState.elements = elements;
    return elements;
  }

  function readDecimalInput(input) {
    if (!input) return 0;
    const value = Number.parseFloat(input.value);
    if (!Number.isFinite(value) || Number.isNaN(value)) return 0;
    return value < 0 ? 0 : value;
  }

  function readIntegerInput(input) {
    if (!input) return 0;
    const value = Number.parseInt(input.value, 10);
    if (Number.isNaN(value)) return 0;
    return value < 0 ? 0 : value;
  }

  function updateFourDayWeekSummary() {
    const elements = getFourDayWeekElements();
    if (!elements) return;

    const core = readDecimalInput(elements.core);
    const longService = readDecimalInput(elements.longService);
    const carryOver = readDecimalInput(elements.carryOver);
    const purchased = readIntegerInput(elements.purchased);
    const bankHolidays = readDecimalInput(elements.bankHolidays);

    const totalDays = core + longService + carryOver + purchased + bankHolidays;
    const totalHours = totalDays * 7.4;

    const setText = (node, text) => {
      if (node) node.textContent = text;
    };

    setText(elements.summaryCore, formatDays(core));
    setText(elements.summaryLongService, formatDays(longService));
    setText(elements.summaryCarryOver, formatDays(carryOver));
    setText(elements.summaryPurchased, formatDays(purchased, 0));
    setText(elements.summaryBankHolidays, formatDays(bankHolidays));

    const equationParts = [core, longService, carryOver, purchased, bankHolidays].map((value) =>
      formatNumber(value, 2)
    );
    const equationText = `Total leave days = ${equationParts.join(' + ')} = ${formatDays(
      totalDays
    )}.`;
    setText(elements.equation, equationText);

    const hoursText = `Total leave allowance in hours = ${formatNumber(
      totalDays,
      2
    )} × 7.4 = ${formatNumber(totalHours, 2)} hours.`;
    setText(elements.totalHours, hoursText);
  }

  function computeBankHolidayAllowanceForDate(startDate) {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return null;
    if (!Array.isArray(bankHolidayState.events) || !bankHolidayState.events.length) return null;

    const bounds = getFinancialYearBounds(startDate);
    if (!bounds) return null;

    const today = new Date();
    const todayMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const startMs = Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate()
    );
    const fyStartMs = bounds.start.getTime();
    const fyEndExclusiveMs = bounds.endExclusive.getTime();

    const futureFy = fyStartMs > todayMs;
    const currentFy = !futureFy && todayMs >= fyStartMs && todayMs < fyEndExclusiveMs;

    let effectiveStartMs = Math.max(startMs, fyStartMs);
    let reason = 'start-date';

    if (futureFy) {
      effectiveStartMs = fyStartMs;
      reason = 'future-year';
    } else if (currentFy) {
      if (todayMs > effectiveStartMs) {
        effectiveStartMs = Math.max(todayMs, fyStartMs);
        reason = 'today';
      }
    } else if (effectiveStartMs === fyStartMs && startMs < fyStartMs) {
      reason = 'financial-year-start';
    }

    if (effectiveStartMs === fyStartMs && reason === 'start-date' && startMs <= fyStartMs) {
      reason = 'financial-year-start';
    }

    let totalInYear = 0;
    let remaining = 0;

    bankHolidayState.events.forEach((event) => {
      const eventDate = parseISODateToUTC(event.date);
      if (!eventDate) return;
      const eventMs = eventDate.getTime();
      if (eventMs >= fyStartMs && eventMs < fyEndExclusiveMs) {
        totalInYear += 1;
        if (eventMs >= effectiveStartMs) {
          remaining += 1;
        }
      }
    });

    return {
      totalInYear,
      remaining,
      bounds,
      effectiveStartDate: new Date(effectiveStartMs),
      reason,
    };
  }

  function setBankHolidayInputValue(elements, value) {
    if (!elements || !elements.bankHolidays) return;
    fourDayWeekState.settingProgrammaticValue = true;
    elements.bankHolidays.value = value;
    fourDayWeekState.settingProgrammaticValue = false;
  }

  function updateFourDayWeekBankHolidayDefault({ force = false } = {}) {
    const elements = getFourDayWeekElements();
    if (!elements) return;

    const setStatus = (message) => {
      if (elements.status) elements.status.textContent = message;
    };

    const startValue = elements.startDate ? elements.startDate.value : '';

    if (!startValue) {
      if (!fourDayWeekState.manualBankHolidayOverride || force) {
        setBankHolidayInputValue(elements, '');
        fourDayWeekState.lastAutoValue = null;
        if (force) fourDayWeekState.manualBankHolidayOverride = false;
      }
      setStatus(
        'Select a start date to automatically calculate the remaining bank holidays for that financial year.'
      );
      updateFourDayWeekSummary();
      return;
    }

    const startDate = parseISODateToUTC(startValue);
    if (!startDate) {
      setStatus('Enter a valid start date to calculate the bank holiday allowance automatically.');
      updateFourDayWeekSummary();
      return;
    }

    const result = computeBankHolidayAllowanceForDate(startDate);
    fourDayWeekState.lastComputedInfo = result;

    if (!result) {
      if (!fourDayWeekState.manualBankHolidayOverride || force) {
        setBankHolidayInputValue(elements, '');
        fourDayWeekState.lastAutoValue = null;
        if (force) fourDayWeekState.manualBankHolidayOverride = false;
      }
      setStatus(
        'Bank holiday data is still loading. Refresh the Bank Holidays page to update this default.'
      );
      updateFourDayWeekSummary();
      return;
    }

    const { remaining, totalInYear, bounds, effectiveStartDate, reason } = result;
    const label = formatFinancialYearLabel(bounds.startYear);
    const startLabel = formatDateForDisplay(bounds.start);
    const endLabel = formatDateForDisplay(bounds.end);
    const effectiveLabel = formatDateForDisplay(effectiveStartDate);
    const remainingCount = formatBankHolidayCount(remaining);
    const totalCount = formatBankHolidayCount(totalInYear);

    let referenceMessage = '';
    if (totalInYear === 0) {
      referenceMessage = `GOV.UK does not list any bank holidays for financial year ${label}.`;
    } else if (reason === 'future-year') {
      referenceMessage = `${totalCount} fall between ${startLabel} and ${endLabel}, and all of them remain because that year has not started yet.`;
    } else if (reason === 'today') {
      referenceMessage = `${totalCount} fall between ${startLabel} and ${endLabel}; ${remainingCount} remain from ${effectiveLabel} onward after accounting for today's date.`;
    } else if (reason === 'financial-year-start') {
      referenceMessage = `${totalCount} fall between ${startLabel} and ${endLabel}.`;
    } else {
      referenceMessage = `${totalCount} fall between ${startLabel} and ${endLabel}; ${remainingCount} remain from ${effectiveLabel} onward based on your selected start date.`;
    }

    if (fourDayWeekState.manualBankHolidayOverride && !force) {
      const manualCount = formatBankHolidayCount(readDecimalInput(elements.bankHolidays));
      const manualMessage =
        totalInYear === 0
          ? `Manual value in use (${manualCount}). ${referenceMessage}`
          : `Manual value in use (${manualCount}). ${referenceMessage}`;
      setStatus(manualMessage);
      updateFourDayWeekSummary();
      return;
    }

    const autoMessage =
      totalInYear === 0
        ? referenceMessage
        : `Defaulted to ${remainingCount} using GOV.UK data for financial year ${label}. ${referenceMessage}`;

    setBankHolidayInputValue(elements, String(remaining));
    fourDayWeekState.lastAutoValue = remaining;
    fourDayWeekState.manualBankHolidayOverride = false;
    setStatus(autoMessage);
    updateFourDayWeekSummary();
  }

  function initializeFourDayWeekCalculator() {
    const elements = getFourDayWeekElements();
    if (!elements) return;

    if (elements.startDate) {
      elements.startDate.addEventListener('input', () => {
        fourDayWeekState.manualBankHolidayOverride = false;
        updateFourDayWeekBankHolidayDefault({ force: true });
      });
    }

    if (elements.core) {
      elements.core.addEventListener('input', () => {
        updateFourDayWeekSummary();
      });
    }

    if (elements.longService) {
      elements.longService.addEventListener('input', () => {
        updateFourDayWeekSummary();
      });
    }

    if (elements.carryOver) {
      elements.carryOver.addEventListener('input', () => {
        updateFourDayWeekSummary();
      });
    }

    if (elements.purchased) {
      elements.purchased.addEventListener('input', () => {
        updateFourDayWeekSummary();
      });
      elements.purchased.addEventListener('blur', () => {
        const value = Number.parseInt(elements.purchased.value, 10);
        if (Number.isNaN(value) || value < 0) return;
        elements.purchased.value = String(value);
      });
    }

    if (elements.bankHolidays) {
      elements.bankHolidays.addEventListener('input', () => {
        if (!fourDayWeekState.settingProgrammaticValue) {
          fourDayWeekState.manualBankHolidayOverride = true;
        }
        updateFourDayWeekSummary();
        updateFourDayWeekBankHolidayDefault();
      });
    }

    updateFourDayWeekSummary();
    updateFourDayWeekBankHolidayDefault();
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
    const { list, yearSelect, empty, error } = elements;
    if (error) error.classList.add('hidden');
    if (!list || !yearSelect) return;

    const events = bankHolidayState.events.slice();

    if (updateYears) {
      const years = Array.from(
        new Set(
          events
            .map((event) => {
              const date = new Date(event.date);
              return Number.isNaN(date.getTime()) ? null : date.getFullYear();
            })
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
        const nowYear = new Date().getFullYear();
        const preferred = years.includes(nowYear) ? nowYear : years[years.length - 1];
        const previous = bankHolidayState.selectedYear
          ? Number.parseInt(bankHolidayState.selectedYear, 10)
          : null;
        const resolved = previous && years.includes(previous) ? previous : preferred;
        bankHolidayState.selectedYear = String(resolved);

        years.forEach((year) => {
          const option = document.createElement('option');
          option.value = String(year);
          option.textContent = String(year);
          if (year === resolved) option.selected = true;
          yearSelect.appendChild(option);
        });
      }
    } else if (yearSelect.value) {
      bankHolidayState.selectedYear = yearSelect.value;
    }

    list.innerHTML = '';
    const selectedYear = Number.parseInt(bankHolidayState.selectedYear || '', 10);

    const filtered = Number.isNaN(selectedYear)
      ? events
      : events.filter((event) => {
          const date = new Date(event.date);
          return !Number.isNaN(date.getTime()) && date.getFullYear() === selectedYear;
        });

    if (!filtered.length) {
      if (empty) empty.classList.remove('hidden');
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
  }

  async function refreshBankHolidays() {
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
      updateFourDayWeekBankHolidayDefault();
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
      updateFourDayWeekBankHolidayDefault();
      if (!bankHolidayState.events.length) {
        void refreshBankHolidays();
      }
    } else {
      renderBankHolidays({ updateYears: true });
      updateFourDayWeekBankHolidayDefault();
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
    if (content instanceof Node) {
      modalBody.appendChild(content);
    } else if (typeof content === 'string') {
      const paragraph = document.createElement('p');
      paragraph.className = 'text-base text-gray-700 dark:text-gray-200';
      paragraph.textContent = content;
      modalBody.appendChild(paragraph);
    }
    const footer = document.createElement('div');
    footer.className = 'mt-6 flex justify-end';
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

      finishWithMessage('TimeTrack has been updated to the latest version.', {
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

      finishWithMessage("You're already using the latest version of TimeTrack.");
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

    initializeFourDayWeekCalculator();
    initializeBankHolidays();

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
          void refreshBankHolidays();
          break;
        case 'close-modal':
          closeModal();
          break;
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
