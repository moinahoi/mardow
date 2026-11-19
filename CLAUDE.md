# Mardow

## Project Conventions
- Tauri only: don't add Electron code, deps or build targets.
- UI is "thin-style": thin strokes, light font weights, subtle overlays, compact menus (Notion-like). Never introduce heavy or bold editor chrome.
- Accent palette: sky blue, purple, pink.

## Workflow
- After every implementation, build the release app with `npm run dist`.
- Publish a release with `npm run release -- x.y.z` (scripts/release.sh): bumps the version, tests, builds, tags, pushes and creates a GitHub release with the zipped app.
