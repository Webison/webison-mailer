# Webison Mailer

Client email desktop locale multi-account per Windows. Scarica posta via IMAP, invia via SMTP, gestisce rubrica, firme e tema chiaro/scuro.

## Requisiti

- [Node.js](https://nodejs.org/) 18+ (consigliato LTS)
- Account email con accesso IMAP e SMTP

## Installazione e avvio

```powershell
cd C:\Users\postd\webison-mailer
npm install
npm run dev
```

| Comando | Uso |
|---------|-----|
| `npm run dev` | Sviluppo: Vite + Electron |
| `npm run build` | Build frontend in `dist/` |
| `npm start` | Avvia Electron con la build (dopo `npm run build`) |

## Come funziona

1. **Account** — Aggiungi uno o più indirizzi (host IMAP/SMTP, credenziali). La password è cifrata con `safeStorage` di Windows.
2. **Aggiorna** — Scarica gli ultimi messaggi della cartella selezionata via IMAP e li salva in cache locale.
3. **Lascia copia sul server** — Attivo di default: il download non elimina i messaggi dal server. Si può disattivare per account.
4. **Scrivi / Rispondi** — Invio via SMTP; una copia viene salvata in **Inviate** (locale) e, se possibile, anche nella cartella Sent IMAP.
5. **Rubrica** — Contatti locali riutilizzabili in composizione.
6. **Firme** — Testi di firma; quella predefinita viene aggiunta ai nuovi messaggi.
7. **Impostazioni** — Tema chiaro o scuro.

## Dati locali

I dati restano sul PC in:

`%APPDATA%\webison-mailer\webison-data\`

Contiene account, cache messaggi, contatti, firme e impostazioni (JSON).

## Note

- Per Gmail/Outlook spesso serve una **password per le app**, non quella del login web.
- Porta SMTP tipica: `587` (STARTTLS) oppure `465` (SSL).
