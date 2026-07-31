# Jira Activity Analyzer v0.2.53 Manual Verification Checklist

Status for this implementation session: **NOT RUN**

## Prerequisites

- Use a read-only Jira account and environment-local `.env`.
- Do not paste credentials into screenshots, logs, reports, or the repository.
- Back up any real SQLite database before migration verification.

## Real Jira

1. Open Connections and confirm the intended Jira server identity.
2. Run one Full Fetch for a test Issue with no Worklogs, one Worklog, and multiple paginated Worklogs.
3. Confirm requests use only GET and include `/rest/api/2/issue/{issueKey}/worklog`.
4. Confirm 401/403 is `permission_restricted`, 404 is `unsupported`, and neither is reported as zero.
5. Confirm Worklog total, fetched, unique, duplicate, parse, and pagination values reconcile.

## COPGEN1-113552

1. Run one Full Fetch.
2. Inspect raw evidence for `fields`, `renderedFields`, `names`, `schema`, complete changelog, complete comments, and complete worklogs.
3. Confirm attachments are metadata only and no attachment body is downloaded.
4. Confirm the Issue is Complete only when all required sources pass.

## Content and Diff

1. Open an event with complete Before/After and verify inline and side-by-side Diff.
2. Open an updated Comment with no Before and verify the Diff column shows plain current content.
3. Confirm latest-only content has no green addition background, plus prefix, red removal block, or blank Before panel.
4. Confirm Comment and Worklog IDs match the raw Jira-native IDs.
5. Confirm deleted content without a body displays an em dash.
6. Verify Chinese, English, URL, code block, table, list, and long Description rendering.

## SQLite v2 to v3

1. Open a copy of a real schema-v2 Current-State database.
2. Trigger a formal save and confirm the transactional migration reaches schema v3.
3. Run `PRAGMA quick_check` and `PRAGMA foreign_key_check`.
4. Confirm all pre-existing Issue, payload, sync-state, metric, and Activity Event rows remain.
5. Repeat the same Full Fetch import and confirm Worklog count does not increase.
6. Confirm Partial, incomplete, permission-restricted, unsupported, and failed targets do not write.

## Windows Delivery

1. Build Installer, Portable, and unpacked artifacts.
2. Launch Installer and Portable on Windows.
3. Confirm Build Version is `0.2.53` and Build Time is populated.
4. Confirm outputs remain under the configured app root and do not fall back to `%LOCALAPPDATA%`.
5. Switch pages during Full Fetch and confirm progress hydration and cancellation remain run-scoped.
6. Generate a Debug Folder and confirm the Worklog/content decision reports exist and contain no secrets.

## Offline

1. Disconnect the network after creating a test Current-State database.
2. Open Issue Viewer and confirm Description, Changelog, Comments, Worklogs, and Activity Events remain readable from SQLite.
3. Confirm no Jira request is sent by local Viewer operations.
