# JiraActivityAnalyzer v0.2.45 Implementation Report

## Scope

v0.2.45 improves local database table usability and saved Jira content readability. It does not change Current-State schema v2, migrate or recreate a database, call Jira from a Viewer, write to Jira, or add a native SQLite dependency.

## Database Overview

- Issue rows are queried in the Electron main process with real SQLite pagination.
- Supported page sizes are 25, 50, 100, and 200; the default is 50.
- Sort fields and filter structures use strict allowlists. User values are SQL parameters.
- The secondary sort is always Issue Key ascending, providing stable page boundaries.
- Key and Action remain available while optional columns can be shown, hidden, ordered, and assigned widths.
- Type, Status, and Priority distributions count the complete current snapshot and expose unset values.
- The database path can be copied. The unused Database Overview Open Folder IPC was removed.

## UI Preferences

Display-only preferences are stored at:

`APP_ROOT/app-data/settings/ui-preferences.json`

The document uses `formatVersion: 1`. Updates use a same-directory temporary file and atomic rename. Unknown top-level sections are retained, malformed documents fall back to safe defaults with a visible warning, and the file never stores credentials, Jira payloads, cookies, or authorization headers.

## Data Collection and Timeline

- Start Date and End Date are editable. Defaults remain 2026-01-01 and the current Asia/Taipei date.
- Existing shared run state supplies those selected dates to execution.
- One calendar month per request, three force-all rounds, a 5-second delay, and union merge are explicit locked values.
- Remote Links is explicit locked OFF text, not a disabled or misleading form control.
- Timeline filters are colocated with the Timeline Event List; required headers support stable sorting.
- Timeline column visibility persists without replacing completed session results.

## Readable Viewer

Description and Comments use one structural renderer. It converts a conservative subset of saved HTML or wiki-style text into React elements without `dangerouslySetInnerHTML`. Script, style, iframe, image, object, and embed nodes are discarded; rendering performs no network request.

Changelog payloads are normalized in the main process into Created, Author, Field, Before, After, and Change values. Comments are normalized into author, timestamps, edited state, body, and format. Raw JSON remains confined to the existing explicit Raw Evidence tab.

## Automated Coverage

The v0.2.45 fixture creates 225 synthetic Current-State issues and verifies:

- five pages at 50 rows, including a final 25-row page;
- filtered and database totals;
- stable sort behavior and query rejection for unsupported sort/filter fields;
- full-snapshot distributions and unset values;
- UI preference persistence, atomic location, and corrupt-file fallback;
- editable Step 1 dates and locked Remote Links wording;
- readable Description, Comments, and Changelog contracts;
- schema v2 remains unchanged.

No real Jira account, credential, production database, or company payload is used.

