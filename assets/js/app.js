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

  function createUtcMiddayDate(year, monthIndex, day) {
    return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
  }

  function parseIsoDateToUtcMidday(value) {
    if (typeof value !== 'string') return null;
    const parts = value.split('-');
    if (parts.length !== 3) return null;
    const [yearStr, monthStr, dayStr] = parts;
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const day = Number.parseInt(dayStr, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const date = createUtcMiddayDate(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

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

  const FOUR_DAY_WEEK_HOURS_PER_DAY = 7.4;

  const fourDayWeekState = {
    userEditedBankHolidays: false,
    defaultInfo: null,
  };
  let fourDayWeekElements = null;

  let welcomeHiddenState = false;

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
              if (!date) return null;
              const parsedDate = parseIsoDateToUtcMidday(date);
              if (!parsedDate) return null;
              const time = parsedDate.getTime();
              return {
                date,
                time,
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
        events: events.sort((a, b) => (a.time || 0) - (b.time || 0)),
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
        if (!date) return null;
        const parsedDate = parseIsoDateToUtcMidday(date);
        if (!parsedDate) return null;
        const time = parsedDate.getTime();
        return {
          date,
          time,
          title:
            typeof event?.title === 'string' && event.title.trim().length
              ? event.title.trim()
              : 'Bank holiday',
          notes: typeof event?.notes === 'string' ? event.notes.trim() : '',
          bunting: !!event?.bunting,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.time || 0) - (b.time || 0));
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
              const time =
                typeof event.time === 'number' && !Number.isNaN(event.time)
                  ? event.time
                  : new Date(event.date).getTime();
              if (!Number.isFinite(time)) return null;
              const date = new Date(time);
              return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
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
        const nowYear = new Date().getUTCFullYear();
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
          const time =
            typeof event.time === 'number' && !Number.isNaN(event.time)
              ? event.time
              : new Date(event.date).getTime();
          if (!Number.isFinite(time)) return false;
          const date = new Date(time);
          return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === selectedYear;
        });

    updateFourDayWeekBankHolidayDefault();

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
      dateLine.textContent = formatBankHolidayDate(
        typeof event.time === 'number' && !Number.isNaN(event.time)
          ? event.time
          : event.date
      );
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

  function getFourDayWeekElements() {
    if (fourDayWeekElements) return fourDayWeekElements;
    const card = document.getElementById('fourDayWeekCard');
    if (!card) return null;
    fourDayWeekElements = {
      card,
      startInput: card.querySelector('[data-four-day-start]'),
      coreInput: card.querySelector('[data-four-day-core]'),
      longServiceInput: card.querySelector('[data-four-day-long-service]'),
      carryInput: card.querySelector('[data-four-day-carry]'),
      purchasedInput: card.querySelector('[data-four-day-purchased]'),
      bankHolidayInput: card.querySelector('[data-four-day-bank-holidays]'),
      useDefaultButton: card.querySelector('[data-four-day-use-default]'),
      bankHolidayNote: card.querySelector('[data-four-day-note]'),
      breakdownList: card.querySelector('[data-four-day-breakdown]'),
      expression: card.querySelector('[data-four-day-expression]'),
      hours: card.querySelector('[data-four-day-hours]'),
    };
    return fourDayWeekElements;
  }

  function parseDateInputValue(input) {
    if (!input) return null;
    const value = typeof input.value === 'string' ? input.value.trim() : '';
    if (!value) return null;
    return parseIsoDateToUtcMidday(value);
  }

  function parseDecimalValue(value) {
    if (typeof value !== 'string') return 0;
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) return 0;
    return parsed < 0 ? 0 : parsed;
  }

  function parseIntegerValue(value) {
    if (typeof value !== 'string') return 0;
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) return 0;
    return parsed < 0 ? 0 : parsed;
  }

  function roundToTwo(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function formatDays(value) {
    if (!Number.isFinite(value)) return '0';
    const rounded = roundToTwo(value);
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(2);
  }

  function describeDays(value) {
    if (!Number.isFinite(value)) return '0 days';
    const rounded = roundToTwo(value);
    const label = Math.abs(rounded - 1) < 1e-9 ? 'day' : 'days';
    return `${formatDays(rounded)} ${label}`;
  }

  function formatHours(value) {
    if (!Number.isFinite(value)) return '0 hours';
    const rounded = roundToTwo(value);
    const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
    return `${label} hours`;
  }

  function formatDisplayDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function getFinancialYearStartYear(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const month = date.getUTCMonth();
    const year = date.getUTCFullYear();
    return month >= 3 ? year : year - 1;
  }

  function getFinancialYearBounds(startYear) {
    if (!Number.isFinite(startYear)) return null;
    const start = createUtcMiddayDate(startYear, 3, 1);
    const end = createUtcMiddayDate(startYear + 1, 2, 31);
    return { start, end };
  }

  function getTodayUtcMidday() {
    const now = new Date();
    return createUtcMiddayDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }

  function computeBankHolidayDefaultInfo(startDate) {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return null;
    const startYear = getFinancialYearStartYear(startDate);
    if (startYear === null) return null;
    const bounds = getFinancialYearBounds(startYear);
    if (!bounds) return null;

    const startTime = bounds.start.getTime();
    const endTime = bounds.end.getTime();

    const eventsInYear = bankHolidayState.events.filter((event) => {
      const time =
        typeof event.time === 'number' && !Number.isNaN(event.time)
          ? event.time
          : new Date(event.date).getTime();
      if (!Number.isFinite(time)) return false;
      return time >= startTime && time <= endTime;
    });

    const today = getTodayUtcMidday();
    const currentYear = getFinancialYearStartYear(today);

    const effectiveStart = (() => {
      if (currentYear !== null && currentYear === startYear) {
        const comparisonTime = today.getTime();
        return comparisonTime > startDate.getTime() ? today : startDate;
      }
      return startDate;
    })();

    const effectiveTime = Math.max(effectiveStart.getTime(), startTime);

    const remaining = eventsInYear.filter((event) => {
      const time =
        typeof event.time === 'number' && !Number.isNaN(event.time)
          ? event.time
          : new Date(event.date).getTime();
      return Number.isFinite(time) && time >= effectiveTime;
    }).length;

    return {
      count: remaining,
      total: eventsInYear.length,
      startYear,
      rangeStart: bounds.start,
      rangeEnd: bounds.end,
      effectiveFrom: new Date(effectiveTime),
      usesToday:
        currentYear !== null &&
        currentYear === startYear &&
        today.getTime() > startDate.getTime(),
    };
  }

  function updateFourDayWeekBankHolidayNote() {
    const elements = getFourDayWeekElements();
    if (!elements || !elements.bankHolidayNote) return;
    const { bankHolidayNote, startInput, bankHolidayInput, useDefaultButton } = elements;

    if (!startInput || !startInput.value) {
      bankHolidayNote.textContent =
        'Select a start date to calculate the remaining bank holidays automatically.';
      if (useDefaultButton) useDefaultButton.disabled = true;
      return;
    }

    if (bankHolidaysLoading && !bankHolidayState.events.length) {
      bankHolidayNote.textContent = 'Fetching the latest bank holiday information…';
      if (useDefaultButton) useDefaultButton.disabled = true;
      return;
    }

    if (!bankHolidayState.events.length || !fourDayWeekState.defaultInfo) {
      bankHolidayNote.textContent =
        'Bank holiday totals are unavailable right now. Try refreshing the Bank Holidays page.';
      if (useDefaultButton) useDefaultButton.disabled = true;
      return;
    }

    const info = fourDayWeekState.defaultInfo;
    if (!info) {
      bankHolidayNote.textContent =
        'Bank holiday totals are unavailable right now. Try refreshing the Bank Holidays page.';
      if (useDefaultButton) useDefaultButton.disabled = true;
      return;
    }

    if (useDefaultButton) useDefaultButton.disabled = false;

    const yearLabel = `${info.rangeStart.getUTCFullYear()}-${info.rangeEnd.getUTCFullYear()}`;
    const periodLabel = `${formatDisplayDate(info.rangeStart)} to ${formatDisplayDate(
      info.rangeEnd
    )}`;
    const effectiveLabel = formatDisplayDate(info.effectiveFrom);
    const totalLabel = describeDays(info.total);
    const remainingLabel = describeDays(info.count);

    let message = `Based on GOV.UK data for the ${yearLabel} financial year (${periodLabel}), ${remainingLabel}`;

    if (info.total === info.count) {
      message += ' fall within this period.';
    } else {
      message += ` remain out of ${totalLabel}.`;
      if (info.count === 0) {
        message += ' There are no bank holidays left for the remainder of this financial year.';
      } else if (info.usesToday) {
        message += ` We started counting from today (${effectiveLabel}).`;
      } else {
        message += ` We started counting from ${effectiveLabel}.`;
      }
    }

    const currentValue = Number.parseInt(
      typeof bankHolidayInput?.value === 'string' ? bankHolidayInput.value : '',
      10
    );
    const matchesDefault = Number.isFinite(currentValue) && currentValue === info.count;

    if (!matchesDefault) {
      message += ` The default is ${describeDays(info.count)}; select "Use default" to apply it.`;
    } else if (!fourDayWeekState.userEditedBankHolidays) {
      message += ' The field has been set automatically.';
    }

    bankHolidayNote.textContent = message;
  }

  function updateFourDayWeekSummary() {
    const elements = getFourDayWeekElements();
    if (!elements) return;
    const {
      coreInput,
      longServiceInput,
      carryInput,
      purchasedInput,
      bankHolidayInput,
      breakdownList,
      expression,
      hours,
    } = elements;

    const values = {
      core: parseDecimalValue(coreInput ? coreInput.value : ''),
      longService: parseDecimalValue(longServiceInput ? longServiceInput.value : ''),
      carry: parseDecimalValue(carryInput ? carryInput.value : ''),
      purchased: parseIntegerValue(purchasedInput ? purchasedInput.value : ''),
      bankHolidays: parseIntegerValue(bankHolidayInput ? bankHolidayInput.value : ''),
    };

    const totalDays = values.core + values.longService + values.carry + values.purchased + values.bankHolidays;

    const breakdownItems = [
      { label: 'Core annual leave allowance', value: values.core },
      { label: 'Long service leave', value: values.longService },
      { label: 'Carry over leave', value: values.carry },
      { label: 'Purchased leave', value: values.purchased },
      { label: 'Bank holidays', value: values.bankHolidays },
    ];

    if (breakdownList) {
      breakdownList.innerHTML = '';
      breakdownItems.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = `${item.label}: ${describeDays(item.value)}`;
        breakdownList.appendChild(li);
      });
    }

    const expressionParts = breakdownItems.map((item) => `${item.label} (${formatDays(item.value)})`);
    const expressionText = `${expressionParts.join(' + ')} = ${formatDays(totalDays)} total days of leave.`;
    if (expression) expression.textContent = expressionText;

    const hoursValue = totalDays * FOUR_DAY_WEEK_HOURS_PER_DAY;
    if (hours)
      hours.textContent = `${formatDays(totalDays)} days × ${FOUR_DAY_WEEK_HOURS_PER_DAY} hours = ${formatHours(
        hoursValue
      )} total.`;
  }

  function updateFourDayWeekBankHolidayDefault({ force = false } = {}) {
    const elements = getFourDayWeekElements();
    if (!elements) return;
    const { startInput, bankHolidayInput } = elements;
    if (!startInput || !bankHolidayInput) return;

    const startDate = parseDateInputValue(startInput);

    if (!startDate) {
      fourDayWeekState.defaultInfo = null;
      if (force) {
        bankHolidayInput.value = '';
        fourDayWeekState.userEditedBankHolidays = false;
      }
      updateFourDayWeekBankHolidayNote();
      updateFourDayWeekSummary();
      return;
    }

    if (bankHolidaysLoading && !bankHolidayState.events.length) {
      fourDayWeekState.defaultInfo = null;
      updateFourDayWeekBankHolidayNote();
      updateFourDayWeekSummary();
      return;
    }

    if (!bankHolidayState.events.length) {
      fourDayWeekState.defaultInfo = null;
      updateFourDayWeekBankHolidayNote();
      updateFourDayWeekSummary();
      return;
    }

    const info = computeBankHolidayDefaultInfo(startDate);
    fourDayWeekState.defaultInfo = info;

    if (!info) {
      updateFourDayWeekBankHolidayNote();
      updateFourDayWeekSummary();
      return;
    }

    const currentValueRaw = typeof bankHolidayInput.value === 'string' ? bankHolidayInput.value.trim() : '';
    const currentNumber = currentValueRaw ? Number.parseInt(currentValueRaw, 10) : null;
    const shouldApply =
      force || !fourDayWeekState.userEditedBankHolidays || currentValueRaw.length === 0;

    if (shouldApply) {
      bankHolidayInput.value = String(info.count);
      fourDayWeekState.userEditedBankHolidays = false;
    }

    updateFourDayWeekBankHolidayNote();
    updateFourDayWeekSummary();
  }

  function initializeFourDayWeek() {
    const elements = getFourDayWeekElements();
    if (!elements) return;
    const {
      startInput,
      coreInput,
      longServiceInput,
      carryInput,
      purchasedInput,
      bankHolidayInput,
      useDefaultButton,
    } = elements;

    const recalc = () => updateFourDayWeekSummary();

    [coreInput, longServiceInput, carryInput, purchasedInput]
      .filter(Boolean)
      .forEach((input) => {
        input.addEventListener('input', recalc);
      });

    if (bankHolidayInput) {
      bankHolidayInput.addEventListener('input', () => {
        fourDayWeekState.userEditedBankHolidays = true;
        updateFourDayWeekBankHolidayNote();
        updateFourDayWeekSummary();
      });
    }

    if (startInput) {
      startInput.addEventListener('change', () => {
        updateFourDayWeekBankHolidayDefault();
      });
    }

    if (useDefaultButton) {
      useDefaultButton.addEventListener('click', () => {
        updateFourDayWeekBankHolidayDefault({ force: true });
      });
    }

    updateFourDayWeekBankHolidayDefault();
    updateFourDayWeekSummary();
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

    initializeFourDayWeek();
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
