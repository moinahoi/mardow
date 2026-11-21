# Mardow

## Project Conventions
- Tauri only: don't add Electron code, deps or build targets.
- UI is "thin-style": thin strokes, light font weights, subtle overlays, compact menus (Notion-like). Never introduce heavy or bold editor chrome.
- Accent palette: sky blue, purple, pink.

## Workflow
- After every implementation, build the release app with `npm run dist`.
- Publish a release with `npm run release` (scripts/release.sh, next patch version; `-- minor|major|x.y.z`, `-m "msg"` for open changes, `-y` without asking, `--dry-run`): commits open changes, bumps the version, tests, builds and signs, tags, pushes, creates the GitHub release with the update files and checks the public update feed. The user runs it from their own terminal; from Claude it needs `-m` and `-y` and must run unsandboxed.
