# Jira Activity Analyzer

Jira Activity Analyzer is a Windows Electron application for read-only Jira
evidence collection, local SQLite viewers, Pending Analysis export, and
traceable AI-assisted skill analysis.

## Current version

- Version: 0.3.10
- Theme: AI Analysis UI Reconstruction & Functional Alignment
- Active AI providers: ChatGPT via bundled Codex App Server, AI Nexus, and
  Offline Rule Analyzer
- Configuration: ENV format v4
- Source Jira databases remain read-only
- AI Analysis writes only completed results to its separate SQLite database

## AI Analysis architecture

The `/ai-analysis` route contains three fixed work areas: AI 連線與診斷,
分析工作區, and Activity Events 分析結果. Electron main owns credentials,
network calls, dialogs, paths, validation, analysis execution, atomic exports,
and SQLite persistence. The context-isolated renderer receives sanitized typed
snapshots through preload IPC.

See [the v0.3.10 implementation note](docs/v0.3.10-ai-analysis-ui-reconstruction.md)
for the UI mapping, rules loader, path contract, state machine, persistence
guarantees, and verification boundary.
