# JiraActivityAnalyzer v0.3.32 Quality Boilerplate Report

## Result

The boilerplate fingerprint scope now contains only model-authored prose: Skill evidence explanation, negative checks, Skill rationale, and record rationale. Source Quote text, exact source substrings, Comments, Description, Changelog, Diff, evidence references, pointers, URLs, image markers, and logs are excluded.

On the supplied v0.3.31 real artifact replay, source-text-driven `BOILERPLATE_EVIDENCE_PATTERN` warnings changed from `48` to `0`. The real model text duplicate ratios remain evidence, including `skillRationaleExactDuplicateRatio=0.2545454545454545`; the versioned threshold was not disabled or weakened.

Synthetic coverage confirms that repeated source Comments with different model explanations do not warn, while genuinely repeated model prose above threshold still produces a warning with JSON pointer, fingerprint hash, group ID, occurrence count, and a safely truncated model-text summary.
