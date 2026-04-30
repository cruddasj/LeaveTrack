const fs = require('fs');
const path = require('path');

const originalFetch = global.fetch;

function loadIndexBody() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!match) throw new Error('Unable to parse body from index.html');
  return match[1];
}

function dispatchInput(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}


function fuzzAllControls() {
  const numberValues = ['0', '1', '5', '-1', 'abc'];
  const dateValues = ['2026-01-01', '2026-06-30', ''];

  document.querySelectorAll('input').forEach((input) => {
    const values = input.type === 'date' ? dateValues : numberValues;
    if (input.type === 'checkbox') {
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    values.forEach((value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  document.querySelectorAll('select').forEach((select) => {
    Array.from(select.options).forEach((option) => {
      select.value = option.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  document.querySelectorAll('button').forEach((button) => {
    button.click();
  });
  document.querySelectorAll('[data-collapsible-trigger]').forEach((button) => {
    button.click();
    button.click();
  });

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}
describe('app coverage interactions', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();

    document.body.innerHTML = loadIndexBody();
    document.documentElement.className = '';
    document.body.className = '';

    Object.defineProperty(window, 'scrollTo', { configurable: true, value: jest.fn() });
    Object.defineProperty(window, 'print', { configurable: true, value: jest.fn() });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: jest.fn(() => ({
        document: {
          open: jest.fn(),
          write: jest.fn(),
          close: jest.fn(),
        },
        focus: jest.fn(),
        print: jest.fn(),
        close: jest.fn(),
      })),
    });

    const bankHolidaysPayload = {
      'england-and-wales': {
        events: [
          { title: 'New Year\'s Day', date: '2026-01-01' },
          { title: 'Good Friday', date: '2026-04-03' },
          { title: 'Christmas Day', date: '2026-12-25' },
        ],
      },
    };

    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('bank-holidays')) return { ok: true, json: async () => bankHolidaysPayload };
      if (u.includes('changelog')) {
        return {
          ok: true,
          json: async () => [
            { version: '9.9.9', date: '2026-01-01', changes: ['Added report printing'] },
            { version: '9.9.8', date: '2025-12-01', changes: ['Improved defaults'] },
          ],
        };
      }
      if (u.includes('version')) return { ok: true, json: async () => ({ version: '9.9.9' }) };
      return { ok: false, json: async () => ({}) };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('exercises major leave-calculation flows and print/update actions', async () => {
    const renderedPrintHtml = [];
    const originalCreateElement = document.createElement.bind(document);
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const originalRemoveChild = document.body.removeChild.bind(document.body);

    jest.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (String(tagName).toLowerCase() === 'iframe') {
        const iframe = {
          style: {},
          tabIndex: -1,
          parentNode: null,
          setAttribute: jest.fn(),
          contentDocument: {
            open: jest.fn(),
            write: jest.fn((html) => renderedPrintHtml.push(String(html))),
            close: jest.fn(),
            title: '',
            readyState: 'complete',
            addEventListener: jest.fn(),
          },
          contentWindow: {
            focus: jest.fn(),
            print: jest.fn(),
            addEventListener: jest.fn(),
          },
        };
        return iframe;
      }
      return originalCreateElement(tagName, options);
    });

    jest.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node && node.contentDocument && node.contentWindow) {
        node.parentNode = document.body;
        return node;
      }
      return originalAppendChild(node);
    });

    jest.spyOn(document.body, 'removeChild').mockImplementation((node) => {
      if (node && node.contentDocument && node.contentWindow) {
        node.parentNode = null;
        return node;
      }
      return originalRemoveChild(node);
    });

    const swListeners = new Map();
    const workerListeners = new Map();
    const worker = {
      state: 'installed',
      addEventListener: jest.fn((event, handler) => workerListeners.set(event, handler)),
      removeEventListener: jest.fn((event) => workerListeners.delete(event)),
      postMessage: jest.fn(() => {
        worker.state = 'activated';
        const stateChange = workerListeners.get('statechange');
        if (stateChange) stateChange();
        const controllerChange = swListeners.get('controllerchange');
        if (controllerChange) controllerChange();
      }),
    };
    const registration = {
      waiting: worker,
      installing: null,
      update: jest.fn(async () => {}),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: jest.fn(async () => registration),
        ready: Promise.resolve(registration),
        register: jest.fn(async () => registration),
        addEventListener: jest.fn((event, handler) => swListeners.set(event, handler)),
        removeEventListener: jest.fn((event) => swListeners.delete(event)),
      },
    });

    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    dispatchInput('leaveYearStartInput', '2026-04-01');
    dispatchInput('leaveYearEndInput', '2027-03-31');
    dispatchInput('standardWeekHoursInput', '40');
    dispatchInput('standardDayHoursInput', '8');
    dispatchInput('fourDayCompressedHoursInput', '10');
    dispatchInput('nineDayCompressedHoursInput', '8.5');

    dispatchInput('standardWeekStartDate', '2026-04-01');
    dispatchInput('standardWeekCoreLeave', '25');
    dispatchInput('standardWeekLongService', '2');
    dispatchInput('standardWeekCarryOver', '1');
    dispatchInput('standardWeekPurchased', '1.5');
    dispatchInput('standardWeekBankHolidays', '8');

    const accrualToggle = document.getElementById('standardAccrualToggle');
    accrualToggle.checked = true;
    accrualToggle.dispatchEvent(new Event('change', { bubbles: true }));
    dispatchInput('standardAccrualRate', '2.08');
    dispatchInput('standardAccrualMode', 'days');

    dispatchInput('standardLeaveStart', '2026-08-01');
    dispatchInput('standardLeaveEnd', '2026-08-12');
    dispatchInput('standardLeaveEndPortion', 'full');
    dispatchInput('standardLeaveTaken', '7');

    dispatchInput('fourDayStartDate', '2026-04-01');
    dispatchInput('fourDayCoreLeave', '20');
    dispatchInput('fourDayLongService', '2');
    dispatchInput('fourDayCarryOver', '1');
    dispatchInput('fourDayPurchased', '2');
    dispatchInput('fourDayBankHolidays', '6');

    dispatchInput('bankHolidayBookerDay', 'monday');

    dispatchInput('existingFourDayStartDate', '2026-04-01');
    dispatchInput('existingFourDayCoreLeave', '20');
    dispatchInput('existingFourDayLongService', '2');
    dispatchInput('existingFourDayCarryOver', '1');
    dispatchInput('existingFourDayPurchased', '2');
    dispatchInput('existingFourDayBankHolidays', '6');
    dispatchInput('existingBankHolidayBookerDay', 'monday');

    dispatchInput('nineDayStartDate', '2026-04-01');
    dispatchInput('nineDayCoreLeave', '18');
    dispatchInput('nineDayLongService', '1');
    dispatchInput('nineDayCarryOver', '2');
    dispatchInput('nineDayPurchased', '1');
    dispatchInput('nineDayBankHolidays', '6');
    dispatchInput('nineDayBookerStartDate', '2026-01-05');

    dispatchInput('existingNineDayStartDate', '2026-04-01');
    dispatchInput('existingNineDayCoreLeave', '18');
    dispatchInput('existingNineDayLongService', '1');
    dispatchInput('existingNineDayCarryOver', '2');
    dispatchInput('existingNineDayPurchased', '1');
    dispatchInput('existingNineDayBankHolidays', '6');
    dispatchInput('existingNineDayBookerStartDate', '2026-01-05');

    document.querySelector('[data-action="print-standard-week"]').click();
    document.querySelector('[data-action="print-four-day"]').click();
    document.querySelector('[data-action="print-existing-four-day"]').click();
    document.querySelector('[data-action="print-nine-day"]').click();
    document.querySelector('[data-action="print-existing-nine-day"]').click();
    document.querySelector('[data-action="refresh-bank-holidays"]').click();

    document.querySelector('[data-action="update-app"]').click();

    expect(document.querySelector('[data-existing-four-day-breakdown]').textContent).toContain(
      'equivalent to',
    );
    expect(document.querySelector('[data-existing-four-day-breakdown]').textContent).toContain(
      'standard days',
    );
    expect(document.querySelector('[data-existing-four-day-summary-intro]').textContent).toContain(
      'forthcoming leave year',
    );
    expect(document.querySelector('[data-existing-nine-day-breakdown]').textContent).toContain(
      'equivalent to',
    );
    expect(document.querySelector('[data-existing-nine-day-breakdown]').textContent).toContain(
      'standard days',
    );
    expect(document.querySelector('[data-existing-nine-day-summary-intro]').textContent).toContain(
      'forthcoming leave year',
    );
    expect(renderedPrintHtml.some((html) => html.includes('Calculated at 10 hours'))).toBe(true);
    expect(renderedPrintHtml.some((html) => html.includes('Calculated at 8.5 hours'))).toBe(true);
    expect(renderedPrintHtml.some((html) => html.includes('equivalent to') && html.includes('standard days'))).toBe(true);

    fuzzAllControls();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector('[data-standard-total-days]').textContent).not.toEqual('');
    expect(document.querySelector('[data-four-day-total-days]').textContent).not.toEqual('');
    expect(document.querySelector('[data-existing-four-day-total-days]').textContent).not.toEqual('');
    expect(document.querySelector('[data-nine-day-total-days]').textContent).not.toEqual('');
    expect(document.querySelector('[data-existing-nine-day-total-days]').textContent).not.toEqual('');
    expect(document.querySelector('[data-app-version]').textContent).toBe('9.9.9');
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  test('handles fetch failures and invalid user inputs with safe fallbacks', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));

    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    dispatchInput('standardWeekCoreLeave', '-4');
    dispatchInput('standardWeekLongService', 'abc');
    dispatchInput('standardWeekCarryOver', '-2');
    dispatchInput('standardWeekPurchased', 'xyz');
    dispatchInput('standardWeekBankHolidays', '-1');
    dispatchInput('standardLeaveTaken', '-5');
    dispatchInput('standardLeaveStart', '');
    dispatchInput('standardLeaveEnd', '');

    dispatchInput('fourDayCoreLeave', '-10');
    dispatchInput('fourDayBankHolidays', '-2');
    dispatchInput('bankHolidayBookerDay', 'friday');

    dispatchInput('existingFourDayCoreLeave', '-10');
    dispatchInput('existingFourDayBankHolidays', '-2');

    dispatchInput('nineDayCoreLeave', '-9');
    dispatchInput('nineDayBankHolidays', '-4');
    dispatchInput('nineDayBookerStartDate', '');

    dispatchInput('existingNineDayCoreLeave', '-9');
    dispatchInput('existingNineDayBankHolidays', '-4');
    dispatchInput('existingNineDayBookerStartDate', '');

    const welcomeToggle = document.getElementById('welcomeToggle');
    welcomeToggle.checked = false;
    welcomeToggle.dispatchEvent(new Event('change', { bubbles: true }));

    const clearDataButton = document.querySelector('[data-action="clear-data"]');
    clearDataButton.click();
    const cancelButton = Array.from(document.querySelectorAll('#modal button')).find(
      (button) => button.textContent.trim() === 'Cancel',
    );
    cancelButton.click();

    expect(document.querySelector('[data-bank-holidays-error]').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('[data-standard-preview-message]').textContent.length).toBeGreaterThan(0);
  });

  test('uses entered start date (not today) for four-day bank holiday period messaging', async () => {
    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    dispatchInput('leaveYearStartInput', '2026-04-01');
    dispatchInput('leaveYearEndInput', '2027-03-31');
    dispatchInput('fourDayStartDate', '2026-04-01');
    dispatchInput('bankHolidayBookerDay', 'monday');

    const message = document.querySelector('#bankHolidayBookerCard [data-booker-message]');
    expect(message.textContent).toContain('between April 1, 2026 and March 31, 2027');
    expect(message.textContent).toContain('organisational working year');
  });

  test('existing 9-day fortnight uses organisational year start while retaining first non-working day pattern', async () => {
    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    dispatchInput('leaveYearStartInput', '2025-04-01');
    dispatchInput('leaveYearEndInput', '2026-03-31');
    dispatchInput('existingNineDayBookerStartDate', '2026-01-05');

    const message = document.querySelector('[data-existing-nine-day-booker-message]');
    const nonMatchesLabel = document.querySelector('[data-existing-nine-day-booker-non-matches-label]');
    const nonMatchesList = document.querySelector('[data-existing-nine-day-booker-non-matches-list]');

    expect(message.textContent).toContain('between April 1, 2025 and March 31, 2026');
    expect(nonMatchesLabel.textContent).toContain('(1)');
    expect(nonMatchesList.textContent).toContain("New Year's Day");
  });

  test('shows orange info warning style when leave end is before leave start', async () => {
    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    dispatchInput('standardLeaveStart', '2026-08-12');
    dispatchInput('standardLeaveEnd', '2026-08-01');

    const message = document.querySelector('[data-standard-preview-message]');
    const icon = document.querySelector('[data-standard-preview-message-icon]');
    expect(message.textContent).toContain('Leave end must be on or after the start date.');
    expect(message.classList.contains('text-amber-700')).toBe(true);
    expect(message.classList.contains('bg-amber-100')).toBe(true);
    expect(message.classList.contains('font-medium')).toBe(true);
    expect(icon.classList.contains('hidden')).toBe(false);
  });
});
