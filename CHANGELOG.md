# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/),
e il progetto aderisce al [Semantic Versioning](https://semver.org/lang/it/).

## [1.6.7] - 2026-09-16

### Changed
- Pubblica in release l’header reader riorganizzato (toolbar azioni + oggetto sotto); la tag `v1.6.6` sul remote non includeva ancora queste modifiche UI.

## [1.6.6] - 2026-09-16

### Changed
- Header del messaggio: azioni in toolbar dedicata, oggetto sotto a tutta larghezza per una lettura più chiara.

## [1.6.5] - 2026-09-16

### Added
- Funzione Inoltra: oggetto `I:`, citazione del messaggio originale, allegati originali in staging e invio senza threading di risposta.

## [1.6.4] - 2026-08-31

### Fixed
- Invio delle risposte corretto: i riferimenti del messaggio sono serializzati prima del passaggio IPC, evitando l’errore “An object could not be cloned”.

## [1.6.3] - 2026-08-31

### Changed
- Gestione allegati nel reader più compatta: i file incorporati nel messaggio sono raggruppati e richiudibili, mentre gli altri restano disponibili in un elenco scorrevole.

## [1.6.2] - 2026-08-31

### Fixed
- Gestione degli errori asincroni IMAP, inclusi i timeout del socket, senza chiusura inattesa dell’app.

## [1.6.0] - 2026-08-03

### Added
- Supporto allegati in ricezione e invio (file su disco, metadati in cache locale)
- Visualizzazione e download allegati nel reader, con risoluzione immagini inline (`cid:`)
- Pulsante Allega in compose, staging sicuro nel main process e MIME completo in SMTP/APPEND Sent
- Test unitari per path sicuri, CID, oversize e spostamento allegati

### Changed
- Sync IMAP e store locale estesi per persistenza e cleanup degli allegati (delete/move/cestino)
