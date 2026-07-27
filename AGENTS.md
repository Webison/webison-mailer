# AGENTS.md — Webison Mailer

Istruzioni per agenti AI (Cursor, Codex, Claude, ecc.) su questo repository.

## Stack
- Electron + Vue 3 (Composition API) + Vite
- Backend mail: `electron/mail/*.cjs` (IMAP imapflow, SMTP nodemailer)
- Dati locali: `%APPDATA%/webison-mailer/`
- Packaging: electron-builder (Windows NSIS)
- Auto-update: electron-updater → GitHub Releases (`Webison/webison-mailer`)
- Repo: https://github.com/Webison/webison-mailer (pubblica — auto-update senza token)

## Principi
- DRY, KISS, YAGNI
- Rispondi all’utente in italiano
- Non creare README/markdown di istruzioni se non richiesti (AGENTS.md / regole AI sono eccezione)
- Non committare segreti, password, `UPDATE_CHECK_TOKEN`, né cartelle `release/`, `dist/`, `node_modules/`

## Versioning (obbligatorio)
Semantic Versioning in `package.json` → `version`.

| Tipo di modifica | Bump |
|------------------|------|
| Bugfix, UI minore, refactor senza feature | **patch** (`1.0.0` → `1.0.1`) |
| Nuova feature retrocompatibile | **minor** (`1.0.1` → `1.1.0`) |
| Breaking change / migrazione dati | **major** (`1.1.0` → `2.0.0`) |

### Regole operative
1. Prima di considerare completato un task che cambia codice runtime, **alza la versione** in `package.json` (e allinea `package-lock.json` se necessario).
2. Comandi: `npm run version:patch` | `version:minor` | `version:major`.
3. Il messaggio di commit deve citare la versione, es. `feat: rispondi a tutti (v1.1.0)`.
4. **Non** creare tag git a mano in locale: ci pensa GitHub Actions su `main`.
5. Ogni push su `main` (senza `[skip ci]`) produce una **GitHub Release** con installer + `latest.yml` per l’auto-update.
6. Se la versione in `package.json` è già taggata (`vX.Y.Z`), la CI fa un bump **patch** automatico di sicurezza.

## Release e aggiornamenti app
- Workflow: `.github/workflows/release.yml`
- Artifact: `Webison Mailer-Setup-<version>.exe`
- Le app installate controllano gli aggiornamenti all’avvio e mostrano una notifica quando un update è scaricato.
- Repo pubblica: `electron-updater` legge le GitHub Releases senza token. Se tornasse privata, serve secret Actions `UPDATE_CHECK_TOKEN` (PAT Contents: Read).

## Dove mettere le mani
- UI: `src/`
- Main process / IPC: `electron/main.cjs`, `electron/preload.cjs`
- Updater: `electron/updater.cjs`
- Store JSON: `electron/mail/store.cjs`

## Dopo cambiamenti Electron
Riavviare l’app (`npm run dev`) perché il main process non fa HMR.
