import assert from "node:assert/strict";
import { splitActivityStreamWindows } from "./activityStreamStability.js";
import { dateInTimeZone, USER_ANALYSIS_DEFAULTS, userAnalysisInitialDates } from "./analysisDefaults.js";

assert.equal(USER_ANALYSIS_DEFAULTS.projectScope, "COPGEN1");
assert.equal(USER_ANALYSIS_DEFAULTS.requestWindow, "calendar_month");
assert.equal(USER_ANALYSIS_DEFAULTS.roundExecutionMode, "force_all_rounds");
assert.equal(USER_ANALYSIS_DEFAULTS.fullScanRoundCount, 3);
assert.equal(USER_ANALYSIS_DEFAULTS.fetchRemoteLinks, false);
assert.equal(dateInTimeZone(new Date("2026-07-20T16:30:00.000Z")), "2026-07-21");
assert.deepEqual(userAnalysisInitialDates(new Date("2026-07-20T16:30:00.000Z")), { startDate: "2026-01-01", endDate: "2026-07-21" });

const windows = splitActivityStreamWindows("2026-01-01", "2026-07-21", "calendar_month");
assert.equal(windows.length, 7);
assert.deepEqual(windows[0], { windowId: "window-001-2026-01-01-2026-01-31", start: "2026-01-01", end: "2026-01-31" });
assert.deepEqual(windows[1], { windowId: "window-002-2026-02-01-2026-02-28", start: "2026-02-01", end: "2026-02-28" });
assert.deepEqual(windows[6], { windowId: "window-007-2026-07-01-2026-07-21", start: "2026-07-01", end: "2026-07-21" });
const leap = splitActivityStreamWindows("2028-02-01", "2028-03-01", "calendar_month");
assert.deepEqual(leap, [
  { windowId: "window-001-2028-02-01-2028-02-29", start: "2028-02-01", end: "2028-02-29" },
  { windowId: "window-002-2028-03-01-2028-03-01", start: "2028-03-01", end: "2028-03-01" }
]);
assert.equal(windows.length * USER_ANALYSIS_DEFAULTS.fullScanRoundCount, 21);
console.log("User Analysis defaults and calendar-window tests passed.");
