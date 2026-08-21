# v0.3.29 Quote Coverage Preflight Report

Coverage runs after frozen segment/quote catalog creation and before capacity preflight or Provider dispatch. It validates record ownership, ID uniqueness, segment, exact display text, role, primary-change coverage, JSON round trip, projection hash, payload hash, and counts.

Failures throw the dedicated `AI_MODEL_VISIBLE_QUOTE_*` codes before `chatgpt.runAnalysis`, so no Thread, Turn, delivery handle, token, Canonical, Active Result, HTML, or SQLite write is created.
