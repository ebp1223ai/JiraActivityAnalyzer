# Jira Activity Analyzer

Jira Activity Analyzer is a Windows Electron application for read-only Jira
evidence collection, local SQLite viewers, Pending Analysis export, and
traceable AI-assisted skill analysis.

## Current version

- Version: 0.3.15
- Theme: Bundled Codex Runtime, Local File Workspace, and Canonical Debug Evidence
- Active AI providers: ChatGPT via bundled and integrity-verified Codex App Server, AI Nexus, and Offline Rule Analyzer
- Configuration: ENV format v4
- Source Jira databases remain read-only
- AI Analysis writes only completed and fully validated results to its separate SQLite database
- Formal ChatGPT analysis uses exactly four local workspace files, one thread, and one turn
- Real 117-record Provider verification and interactive OAuth are Manual Pending
## AI Analysis architecture

The `/ai-analysis` route contains three fixed work areas: AI 連線與診斷,
分析工作區, and Activity Events 分析結果. Electron main owns credentials,
network calls, dialogs, paths, validation, analysis execution, atomic exports,
and SQLite persistence. The context-isolated renderer receives sanitized typed
snapshots through preload IPC.

See [the v0.3.15 implementation note](docs/v0.3.15-bundled-codex-local-workspace-debug-evidence.md) for bundled runtime integrity, exact local workspace delivery, count-aware output, canonical Run evidence, and Debug Folder completeness.
