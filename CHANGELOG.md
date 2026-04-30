# Changelog

All notable changes to LeaveTrack will be documented in this file. This project adheres to a manual release process; update both this file and `assets/changelog.json` when shipping new versions so the in-app update summary stays accurate.

## [NEXT_VERSION] - [NEXT_DATE]

- Hide the Print PDF cards when printing pages so exported printouts only include the leave details.

## 0.0.40 - 2026-04-30

- Move the Standard week accrual settings into Settings so organisations can manage one shared policy configuration.

## 0.0.41 - 2026-04-30

- Reorder Settings so the organisational working year appears before accrual settings, clarify that accrual settings are only used by the Standard week page, and show Standard week remaining-balance status with coloured text instead of coloured backgrounds.

## 0.0.39 - 2026-04-30

- Make the Standard week leave date-order warning use an orange information style with an icon so it stands out more clearly.
- Update npm dependencies to the latest available minor and patch releases.

## 0.0.38 - 2026-04-05

- Existing 9-day fortnight bank-holiday matching now reviews the full organisational working year from its start date while still using the selected first non-working day to determine every-other-week matches.
- Update development dependencies to the latest patch/minor releases for Playwright, Node type definitions, and ESLint.

## 0.0.37 - 2026-04-05

- Calculate bank holiday period summaries from the entered start date so past dates in the selected working year are included when reviewing matching days.
- Update development dependencies to the latest patch/minor releases for Playwright, Node type definitions, and ESLint.

## 0.0.36 - 2026-03-24

- Show the updated carry-over leave wording and standard-day conversion text in PDF exports for Existing 4-day week and Existing 9-day fortnight reports.
- Update development dependencies to the latest patch/minor releases for eslint and markdownlint-cli2.

## 0.0.35 - 2026-03-24

- Add an Existing 9-day fortnight page with matched cards and carry-over leave converted using the 9-day fortnight day-hours setting.
- Keep start-date guidance on the existing compressed-week pages focused on bank-holiday timing instead of joiner-specific optional messaging.

## 0.0.34 - 2026-03-24

- Add existing 4-day week page.

## 0.0.33 - 2026-03-19

- Remove the yellow warning background from the Standard week remaining balance card so the section keeps a neutral surface.

## 0.0.30 - 2026-03-19

- Reset the app styles to the AppTemplate baseline so the interface uses the shared design system consistently.

## 0.0.32 - 2026-03-19

- Soften and blur the mobile navigation backdrop in light mode so opening the menu no longer blacks out the page behind it.

## 0.0.31 - 2026-03-19

- Reconnect Tailwind's shared config in the stylesheet build so the Light and Inverted theme toggles follow app settings again.

## 0.0.29 - 2026-03-19

- Update the Tailwind stylesheet entrypoint to match Tailwind CSS v4 so GitHub Pages deployments can build CSS successfully.

## 0.0.28 - 2026-03-19

- Mirror the latest AppTemplate dark-mode styling updates for more consistent contrast across cards, sidebar, and overlays.
- Prevent background page scrolling while the mobile navigation panel is open so menu interactions stay focused.

## 0.0.27 - 2026-03-19

- Expand Jest coverage tests to exercise key planning, entitlement, and update flows so all global 80% coverage gates (including branches) pass.

## 0.0.25 - 2026-03-18

- Fix the pull request test workflow to run the project's Node.js unit test coverage command directly, so CI no longer relies on Jest-only reporting.

## 0.0.24 - 2026-03-18

- Switch GitHub Actions install steps to `npm install` so CI no longer fails when lockfile sync differs during dependency updates.
- Add an npm `ci` command alias so GitHub Actions and local CI calls to `npm run ci` work consistently.
- Update development dependency versions to match the AppTemplate baseline.
- Align GitHub workflows with the AppTemplate repository structure and automation flow.
- Sync AGENTS.md with the upstream LeaveTrack instructions and contribution workflow.
- Sync GitHub CI and automation metadata with the upstream template, including Dependabot configuration.

## [0.0.22] - 2026-03-18

- Add CI quality checks for linting, CSS consistency, and unit tests with an 80% line-coverage gate.
- Improve mobile section navigation scrolling and highlight active navigation items in dark mode.
- Sync shared utility helpers for weekly-hour conversions and theme selection to support maintainable tests.

## [0.0.21] - 2025-10-18

- Count auto-filled bank holidays from the employee's start date through the working year, or from today when no start date is provided.

## [0.0.20] - 2025-10-17

- Show the chosen start date in bank holiday auto-fill messages and clarify when earlier bank holidays have already passed.

## [0.0.19] - 2025-10-16

- Show accrued leave as of the leave start and surface the remaining accrued entitlement when planning Standard week leave.

## [0.0.17] - 2025-10-15

- Clearly label the Standard week accrual settings as optional and keep the monthly rate editable while typing.
- Pre-fill the Standard week bank holidays field with the current working year total, still allowing manual overrides.

## [0.0.16] - 2025-10-15

- Leave start date inputs now begin empty so new users can enter the correct join date themselves.

## [0.0.15] - 2025-10-16

- Default the organisational working year to run from 1 April to 31 March for new users.

## [0.0.14] - 2025-10-15

- Clarify that the Standard week start date is optional for mid-year joiners and rename the remaining balance label.
- Automatically pro-rate the core allowance for mid-year joiners when a start date is provided on the Standard week card.

## [0.0.13] - 2025-10-15

- Add a Print to PDF card to the Standard week calculator so you can export those allowances.

## [0.0.12] - 2025-10-16

- Default the monthly accrual rate to core plus long service leave divided by 12 while keeping the field editable.
- Highlight whether a proposed leave period is covered by the remaining allowance, including half-day end support and a field for leave already taken.

## [0.0.11] - 2025-10-15

- Replace the "How accrual is applied" chooser with a dropdown for easier use on smaller screens.
- Show the detailed bank holidays that fall within the proposed leave period instead of only the count.

## [0.0.10] - 2025-10-14

- Let you override the auto-calculated organisational working year end date directly from Settings.
- Add a Standard week view with annual leave inputs, monthly accrual options, and a leave period planner that accounts for bank holidays.

## [0.0.9] - 2025-10-13

- Allow configuring the organisational working year and show the selected date range across the bank holiday tools.
- Add Settings controls to customise standard and compressed-day hour conversions used by the calculators.
- Let Settings derive the default conversion hours from a configurable weekly total and display the formulas behind them.
- Update the Bank Holidays messaging to reference the organisational working year and align it beneath the selector.
- Correct the default compressed-day hours so 4-day weeks use 8.22 hours and 9-day fortnights use 9.25 hours by default.
- Make the organisational working year finish exactly one year minus one day after the selected start date.

## [0.0.8] - 2025-10-13

- Group the Bank Holidays view by financial year so each option spans 1 April to 31 March.

## [0.0.7] - 2025-10-12

- Hide the Bank holiday booker section in exported PDFs until the required selections are provided.
- Left-align empty Bank holiday booker list messages in PDF exports for improved readability.

## [0.0.6] - 2025-10-12

- Reposition the Print to PDF button so it sits below its description on larger screens for improved alignment.

## [0.0.5] - 2025-10-12

- Ensure the Bank holiday booker report sections always start on a fresh page when printing PDFs so content isn't clipped.

## [0.0.3] - 2025-10-12

- Add print-to-PDF reports for the 4-day week and 9-day fortnight calculators, including bank holiday booker details in the export.
- Move the print controls into dedicated report cards and generate PDFs in-page so pop-up blockers no longer interfere.
- Remove browser header and footer details from exported PDFs so reports focus solely on calculator content.

## [0.0.2] - 2025-10-12

- Update the welcome page and documentation to highlight the compressed-week calculators.

## [0.0.1] - 2025-10-11

- Add initial functionality for 4-day week and 9-day fortnight.

## [0.0.0] - 2025-10-11

- Create base Progressive Web app.
