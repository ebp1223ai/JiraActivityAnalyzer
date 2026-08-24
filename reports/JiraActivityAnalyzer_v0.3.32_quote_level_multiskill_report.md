# JiraActivityAnalyzer v0.3.32 Quote-level Multi-skill Report

## Result

The v0.3.31 real 17-record Debug Folder was replayed without modifying its submitted decisions. The old parent-evidence rule blocked 14 records. The v0.3.32 quote-level rule releases records `1, 2, 12, 13` and correctly retains blockers for `0, 4, 5, 7, 9, 10, 11, 14, 15, 16`.

## Identity And Rule

Contract: `jaa-multi-skill-quote-independence-v1`.

`QuoteIdentityKey = sourceRecordStableId + sourceJsonPointer + rawStartOffset + rawEndOffset + quoteSha256`

Only frozen Evidence Quote Catalog entries eligible for `PRIMARY_CHANGE` participate. Each Skill in a multi-skill record requires at least one key not used by another Skill in that record. Shared parent `evidenceRef`, Comment, Diff, Activity Event, or container segment does not make distinct source spans identical. Different Quote IDs resolving to the same key remain shared.

## Evidence

- record 12: four Skills have independent PRIMARY_CHANGE quote keys and now pass this gate.
- record 13: four Skills have independent PRIMARY_CHANGE quote keys and now pass this gate.
- record 0: `DEBUG_004` only shares a PRIMARY_CHANGE quote with `GC_006`; it remains blocked.
- New finding code: `MULTI_SKILL_EXCLUSIVE_PRIMARY_QUOTE_MISSING`, emitted per affected Skill with record, Skill, pointer, primary/shared/exclusive key diagnostics.
- Replay result: 17 decisions, 38 Skill findings; released records `1, 2, 12, 13`; retained records `0, 4, 5, 7, 9, 10, 11, 14, 15, 16`.

This replay is historical evidence validation, not a v0.3.32 Managed OAuth analysis run.
