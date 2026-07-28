# Prepare Git Release Tag

Prepare a local release commit and local git tag for this project. Never push.

## Required behavior

1. Inspect the repository state:
   - `git status --short`
   - `git diff --name-only HEAD`
   - `git tag --sort=-v:refname`
2. Determine the intended version bump from the user's request:
   - `patch`
   - `minor`
   - `major`
   - explicit `x.y.z`
3. If the bump is unclear, ask the user before making release changes.
4. **CHANGELOG:** if `CHANGELOG.md` does not exist, `release:prepare` creates it (Keep a Changelog format) and inserts `## [X.Y.Z] - YYYY-MM-DD` with placeholder sections.
5. **Versione in app:** `package.json` is the source of truth. `nuxt.config.js` exposes `runtimeConfig.public.appVersion`; the footer in `app/layouts/default.vue` shows `v{{ appVersion }}`. Only `package.json` (and lockfile) need updating — no manual edits to `nuxt.config.js`.
6. Run a preview first (dry run, no file changes, no git):
   - `npm run release:prepare -- patch`
   - oppure `node tools/release-prepare.mjs patch`
7. Review the preview and call out risky or unrelated files before proceeding.
8. Ask for explicit confirmation before running the real release command.
9. After confirmation, run **one** of these (writes files, commit + tag locally):
   - `npm run release:patch` (or `release:minor` / `release:major`)
   - `node tools/release-prepare.mjs patch --yes`
   - **Do not use** `npm run release:prepare -- patch --yes` on Windows: `--yes` often does not reach the script.
10. Verify **before telling the user to push**:
   - `git tag -l vX.Y.Z` returns the tag (if empty, the release was not applied)
   - `CHANGELOG.md` exists and has the new version section
   - `package.json` version is updated
   - `package-lock.json` root package version is updated (if lockfile exists)
   - footer shows `vX.Y.Z` after build/deploy (from `package.json`)
   - `npm run build` completed successfully (unless `--no-build` was used)
   - local commit exists with message `chore(release): vX.Y.Z`
   - local tag `vX.Y.Z` exists

## Errore frequente: `src refspec vX.Y.Z does not match any`

Significa che **`git push origin vX.Y.Z` è stato eseguito prima** di creare il tag in locale. L'anteprima (`release:prepare` senza `--yes`) **non crea** il tag.

**Soluzione:** eseguire `npm run release:patch` (o il bump corretto), poi verificare `git tag -l vX.Y.Z`, poi push.

## Hard stop

Do not run `git push`, `git push --tags`, or any equivalent push command.
Stop after the local commit and local tag. In the final response, show the user
the manual push commands they can run themselves.

## Files to pay attention to

- `CHANGELOG.md` (create if missing, then update each release)
- `package.json` (version source for UI and npm)
- `package-lock.json` (root `packages[""].version` when present)
- `tools/release-prepare.mjs` (release automation)
- `dist/` (build artifact, usually in `.gitignore`)
- any files changed since the last commit

## Scripts

| Command | Effect |
|---------|--------|
| `npm run release:prepare -- patch` | Preview only |
| `npm run release:patch` | Apply patch bump + commit + tag + build |
| `npm run release:minor` | Apply minor bump + commit + tag + build |
| `npm run release:major` | Apply major bump + commit + tag + build |
| `node tools/release-prepare.mjs 1.2.0 --yes` | Explicit version |
| `node tools/release-prepare.mjs patch --yes --no-build` | Skip build step |
