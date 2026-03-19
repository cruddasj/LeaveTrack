const fs = require('fs');
const path = require('path');

describe('tailwind source configuration', () => {
  test('loads repository Tailwind config so class-based dark mode works', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
    expect(source).toMatch(/@config\s+"\.\.\/tailwind\.config\.js";/);
  });
});
