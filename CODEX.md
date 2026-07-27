# CODEX.md — Webison Mailer

Mirror operativo di `AGENTS.md` per agenti Codex / CLI.

## Repo
https://github.com/Webison/webison-mailer

## Prima di chiudere un task con modifiche al codice
1. Decidi bump: patch | minor | major (vedi tabella in `AGENTS.md`).
2. Esegui `npm run version:<bump>`.
3. Commit con versione nel messaggio.
4. Push su `main` → Actions crea Release + gli client ricevono l’update.

## Non fare
- Tag git manuali per le release
- Commit di `release/`, `dist/`, token, password
- Skip del bump versione su cambi runtime

## Comandi utili
```bash
npm run dev
npm run version:patch
npm run dist          # build locale, no publish
# push su main → release CI
```

## Auto-update (repo privata)
Secret Actions richiesto: `UPDATE_CHECK_TOKEN` (PAT Contents: Read).
