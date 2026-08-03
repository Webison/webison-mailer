# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/),
e il progetto aderisce al [Semantic Versioning](https://semver.org/lang/it/).

## [1.6.0] - 2026-08-03

### Added
- Supporto allegati in ricezione e invio (file su disco, metadati in cache locale)
- Visualizzazione e download allegati nel reader, con risoluzione immagini inline (`cid:`)
- Pulsante Allega in compose, staging sicuro nel main process e MIME completo in SMTP/APPEND Sent
- Test unitari per path sicuri, CID, oversize e spostamento allegati

### Changed
- Sync IMAP e store locale estesi per persistenza e cleanup degli allegati (delete/move/cestino)
