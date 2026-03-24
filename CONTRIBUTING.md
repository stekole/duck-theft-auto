# Contributing to Duck Theft Auto

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repo and clone your fork
2. Create a feature branch off `main`: `git checkout -b feature-my-thing`
3. Run a local server for development: `python3 -m http.server`
4. Open `http://localhost:8000` in your browser
5. Make your changes, test in-browser
6. Rebuild the single-file dist: `./build.sh`
7. Open a PR against `main`

## Project Structure

```
index.html          — HTML, CSS, module bootstrap (needs local server)
js/constants.js     — game data (cities, jobs, crimes, guns, drugs, gangs, perks)
js/city.js          — procedural city map generation
js/renderer.js      — Three.js 3D rendering (duck, city, NPCs, particles, lighting)
js/db.js            — DuckDB-WASM init, schema, queries, save/load
js/multiplayer.js   — P2P multiplayer (Trystero/WebRTC, lobby, sync, security)
js/game.js          — all gameplay logic, menus, keyboard controls
build.sh            — builds dist/index.html from source files
dist/index.html     — single-file build (works with file://, no server needed)
```

## Development Rules

### No build tools required
This project uses vanilla JS ES modules with CDN imports. No npm, no bundler, no transpiler. Keep it that way.

### Security-first for multiplayer code
Any PR touching `js/multiplayer.js`, `js/db.js`, or P2P data handling **requires extra scrutiny**:

- **Never trust peer data.** All values from remote peers must be validated — type-checked, range-clamped, and sanitized before use.
- **Never interpolate raw peer data into SQL.** Numeric fields must go through `Number()` + `Number.isFinite()`. Strings must be escaped and length-limited.
- **Never use `innerHTML` with dynamic data.** Use `textContent` or DOM APIs (`createElement`/`appendChild`).
- **Never accept messages from kicked peers.** All receive handlers must check `kickedPeers`.
- **Rate limit and validate all incoming P2P events.** Check tick, check rate limit, check range where applicable.

### SQL queries
- All string values interpolated into SQL must use `.replace(/'/g, "''")` escaping
- All numeric values from external sources must be validated with `Number.isFinite()`
- Table and column names must be checked against whitelists (see `VALID_TABLES` / `VALID_COLUMNS` in db.js)
- Long-term goal: migrate to parameterized queries via `conn.prepare()`

### DOM and rendering
- Use `textContent` for any user-visible text that could contain untrusted data
- Use `innerHTML` only with hardcoded strings from constants — never with DB values or peer data
- Cap resource-intensive operations (particle count, remote duck count) to prevent DoS

### Build script
- `build.sh` uses **perl** to strip multi-line imports (not sed)
- After changes, always run `./build.sh` and verify `dist/index.html` works standalone
- Check that no orphaned import lines remain (look for `} from './`)

## What to Contribute

### Welcome
- New game features (crimes, jobs, items, vehicles, city content)
- Visual improvements (3D models, animations, effects)
- UI/UX improvements
- Bug fixes
- Performance optimizations
- Multiplayer features and improvements
- Security hardening
- Documentation

### Please discuss first
Open an issue before starting work on:
- Architectural changes (new modules, changing the state model)
- Adding npm dependencies or build tools
- Changes to the save format (can break existing saves)
- Changes to the P2P protocol (can break multiplayer compatibility)

## Pull Request Guidelines

1. **Keep PRs focused.** One feature or fix per PR. Don't mix unrelated changes.
2. **Test in-browser.** There's no test suite — test your changes manually in at least one browser.
3. **Test multiplayer changes in two tabs.** Host in one tab, join in the other, verify sync works.
4. **Rebuild dist.** Run `./build.sh` and include the updated `dist/index.html` if it changed.
5. **Describe what you changed and why** in the PR description.
6. **Security-sensitive PRs** will get extra review time. Please be patient.

## Code Style

- 2-space indentation
- Single quotes for strings
- `const` by default, `let` when reassignment is needed, never `var`
- `async/await` over `.then()` chains
- Descriptive function names, minimal comments (comment the why, not the what)
- No TypeScript, no JSX, no framework abstractions

## Reporting Security Issues

If you find a security vulnerability, **do not open a public issue.** Instead, use GitHub's private vulnerability reporting feature under the Security tab, or contact the maintainer directly.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
