describe('app bootstrap', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.className = '';
    document.body.className = '';
    document.body.innerHTML = `
      <input id="themeToggle" type="checkbox">
      <select id="themeSelect">
        <option value="default">default</option>
        <option value="inverted">inverted</option>
        <option value="glass">glass</option>
      </select>
      <input id="mobileNavStickyToggle" type="checkbox">
      <input id="welcomeToggle" type="checkbox">
      <button id="brandHome" type="button"></button>
      <button id="menu-toggle" type="button"></button>
      <button id="clearDataButton" type="button" data-action="clear-data"></button>
      <button id="updateButton" type="button" data-action="update-app">Check updates</button>
      <aside id="sidebar" class="-translate-x-full">
        <button class="nav-btn" data-target="welcome"></button>
        <button class="nav-btn" data-target="settings"></button>
      </aside>
      <div id="overlay" class="hidden"></div>
      <div id="mobileHeader" class="dark:bg-gray-900"></div>
      <main>
        <section id="welcome" class="content-section active" data-first-time></section>
        <section id="settings" class="content-section"></section>
        <section
          class="card is-collapsible"
          data-collapsible
          data-collapsible-id="example-card"
          data-collapsible-default="collapsed"
        >
          <button data-collapsible-trigger aria-controls="example-content" aria-expanded="false"></button>
          <div id="example-content" data-collapsible-content>body</div>
        </section>
      </main>
      <div id="modal" class="modal-hidden">
        <div id="modal-body"></div>
      </div>
      <section id="changelogCard">
        <div data-changelog-list></div>
        <p data-changelog-empty class="hidden"></p>
        <p data-changelog-error class="hidden"></p>
      </section>
      <span data-app-version></span>
    `;
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('changelog')) {
        return {
          ok: true,
          json: async () => [{ version: '9.9.9', date: '2026-01-01', changes: ['x'] }],
        };
      }
      if (String(url).includes('version')) {
        return {
          ok: true,
          json: async () => ({ version: '9.9.9' }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('toggles the mobile sidebar using menu, overlay and escape key', () => {
    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    document.getElementById('menu-toggle').click();
    expect(document.getElementById('sidebar').classList.contains('-translate-x-full')).toBe(false);
    expect(document.body.classList.contains('mobile-nav-open')).toBe(true);

    document.getElementById('overlay').click();
    expect(document.getElementById('sidebar').classList.contains('-translate-x-full')).toBe(true);

    document.getElementById('menu-toggle').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('sidebar').classList.contains('-translate-x-full')).toBe(true);
  });

  test('restores and persists collapsible card state', () => {
    localStorage.setItem('collapsedCards', JSON.stringify({ 'example-card': true }));

    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const card = document.querySelector('[data-collapsible-id="example-card"]');
    expect(card.classList.contains('collapsed')).toBe(true);
    expect(document.getElementById('example-content').hidden).toBe(true);
  });

  test('loads app script and applies persisted theme settings', async () => {
    localStorage.setItem('themeDark', '1');
    localStorage.setItem('themeChoice', 'glass');
    localStorage.setItem('mobileNavSticky', '0');
    localStorage.setItem('activeView', 'settings');

    expect(() => {
      require('../assets/js/app.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
    }).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-glass')).toBe(true);
    expect(document.getElementById('themeToggle').checked).toBe(true);
    expect(document.getElementById('themeSelect').value).toBe('glass');
    expect(document.body.classList.contains('mobile-header-static')).toBe(true);
    expect(document.getElementById('settings').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-app-version]').textContent).toBe('9.9.9');
  });

  test('updates persisted preferences when controls are changed', () => {
    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const themeToggle = document.getElementById('themeToggle');
    themeToggle.checked = true;
    themeToggle.dispatchEvent(new Event('change', { bubbles: true }));

    const themeSelect = document.getElementById('themeSelect');
    themeSelect.value = 'inverted';
    themeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const stickyToggle = document.getElementById('mobileNavStickyToggle');
    stickyToggle.checked = false;
    stickyToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('themeDark')).toBe('1');
    expect(localStorage.getItem('themeChoice')).toBe('inverted');
    expect(localStorage.getItem('mobileNavSticky')).toBe('0');
    expect(document.documentElement.classList.contains('theme-inverted')).toBe(true);
  });

  test('hides welcome section when first-time toggle is turned off', () => {
    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const welcomeToggle = document.getElementById('welcomeToggle');
    welcomeToggle.checked = false;
    welcomeToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('welcomeDisabled')).toBe('1');
    expect(document.querySelector('[data-first-time]').classList.contains('hidden')).toBe(true);
    expect(localStorage.getItem('activeView')).toBe('settings');
  });

  test('shows update message when service worker is unavailable', () => {
    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    document.getElementById('updateButton').click();

    expect(document.getElementById('modal').classList.contains('modal-hidden')).toBe(false);
    expect(document.getElementById('modal-body').textContent).toContain(
      "Automatic updates aren't supported",
    );
  });

  test('falls back to window.alert when modal container is missing', () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    document.getElementById('modal').remove();

    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('updateButton').click();

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining("Automatic updates aren't supported"),
    );
    alertSpy.mockRestore();
  });

  test('clear-data action can be cancelled from confirmation modal', () => {
    require('../assets/js/app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    document.getElementById('clearDataButton').click();
    const cancelButton = Array.from(document.querySelectorAll('#modal button')).find(
      (button) => button.textContent === 'Cancel',
    );

    expect(cancelButton).toBeTruthy();
    cancelButton.click();
    expect(document.getElementById('modal').classList.contains('modal-hidden')).toBe(true);
  });

  test('runs service-worker update flow when a waiting worker exists', async () => {
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

    document.getElementById('updateButton').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(document.getElementById('modal-body').textContent).toContain('updated to the latest version');
  });
});