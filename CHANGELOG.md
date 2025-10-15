# Changelog

All notable changes to LeaveTrack will be documented in this file. This project adheres to a manual release process; update both this file and `assets/changelog.json` when shipping new versions so the in-app update summary stays accurate.

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
