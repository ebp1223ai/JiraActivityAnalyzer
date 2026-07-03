# Jira Activity Analyzer

First static UI prototype for Jira Activity Analyzer / Activity Builder.

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`

## Build Time

The app injects `__BUILD_TIME__` from `vite.config.ts`.

- `npm run dev`: `Development Mode`
- `npm run build`: Asia/Taipei timestamp in `YYYY/MM/DD HH:mm:ss`-style locale output

Build Time is shown in the sidebar and in Settings > System Status.
