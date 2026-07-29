# Instagram Follow Checker

[![CI](https://github.com/omgitsjan/instagram-follow-checker/actions/workflows/ci.yml/badge.svg)](https://github.com/omgitsjan/instagram-follow-checker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Chrome-Extension** (Manifest V3), die anzeigt:

| Tab | Bedeutung |
|-----|-----------|
| **Gegenseitig** | Du folgst ihnen und sie folgen dir |
| **Folgt nicht zurück** | Du folgst ihnen, sie dir nicht → optional **Entfolgen** |
| **Ich folge nicht** | Sie folgen dir, du ihnen nicht → optional **Folgen** |

Keine offizielle Instagram-API, keine Paywall, keine externen Server. Die Extension nutzt nur **deine bereits eingeloggte Browser-Session** auf `instagram.com`.

> **Vibe-coded.** Dieses Projekt wurde explorativ mit KI gebaut – nicht als Produktions- oder Enterprise-Software. Erwarte Ecken und Kanten, Breaking Changes von Instagram und null Support-Garantie.

---

## ⚠️ Wichtiger Hinweis / Risk Disclaimer

**Lies das, bevor du die Extension installierst oder nutzt.**

### Keine Haftung

- Dieses Projekt wird **„as is“ / wie besehen** bereitgestellt, **ohne jegliche Gewährleistung** (weder ausdrücklich noch stillschweigend).
- Die Autoren und Mitwirkenden übernehmen **keine Haftung** für:
  - Account-Sperren, -Einschränkungen oder -Löschungen
  - verlorene Follower, Datenverlust oder sonstige Schäden
  - rechtliche oder wirtschaftliche Folgen deiner Nutzung
- Nutzung **auf eigenes Risiko**.

### Instagram Terms of Service / Automatisierung

Dieses Tool greift **nicht** auf die offizielle Instagram Graph API zu. Es liest und steuert Daten über die **Web-Oberfläche bzw. interne Web-Endpunkte**, die die Website selbst nutzt (Session-Cookies im Browser).

Das kann gegen die **Nutzungsbedingungen von Instagram / Meta** verstoßen, insbesondere soweit dort untersagt sind:

- automatisierter Zugriff, Scraping oder inoffizielle Clients  
- massenhaftes Folgen / Entfolgen  
- Verhalten, das wie Bots oder Skripte wirkt  

**Mögliche Folgen** (je nach Nutzung und Instagram-Policy, ohne Anspruch auf Vollständigkeit):

- temporäre Action-Blocks („Bitte warte ein paar Minuten…“)
- eingeschränkte Funktionen
- **Account-Sperre oder dauerhafte Bannung**
- weitere Maßnahmen nach Ermessen von Meta/Instagram

**Empfehlung:**

- nur mit einem Account nutzen, den du dir „leisten“ kannst zu riskieren  
- **nicht** hunderte Follow/Unfollow-Aktionen am Stück  
- Pausen einhalten, wenn Instagram drosselt (HTTP 429)  
- diese Software **nicht** für Spam, Harassment oder kommerzielle Massenaktionen einsetzen  

Dieses Repo ist **kein** Ratschlag, ToS zu umgehen. Es ist ein technisches Hobby-/Lernprojekt. **Du** bist für die Einhaltung der Regeln von Instagram und geltendem Recht verantwortlich.

### Keine offizielle Verbindung

- **Nicht** von Meta, Instagram oder verbundenen Unternehmen.
- **Nicht** im Chrome Web Store freigegeben (lokal / unpacked).
- Interne Endpunkte von Instagram können **jederzeit** brechen.

---

## Features

- 3 Listen: gegenseitig / folgt nicht zurück / ich folge nicht  
- Profilbilder (mit Fallback über den Instagram-Tab)  
- **Entfolgen** im Tab „Folgt nicht zurück“  
- **Folgen** im Tab „Ich folge nicht“ (private Accounts → oft „Angefragt“)  
- Suche, JSON-Export, letztes Ergebnis im lokalen Storage  
- alles lokal im Browser – **kein** Backend  

---

## Privacy

- Privacy policy: [PRIVACY.md](./PRIVACY.md)  
- Public URL (Chrome Web Store): https://github.com/omgitsjan/instagram-follow-checker/blob/main/PRIVACY.md  
- Store form answers (DE/EN): [`store/chrome-web-store-form-answers-de.txt`](./store/chrome-web-store-form-answers-de.txt)

The extension processes Instagram relationship data **locally in your browser** only. No analysis data is sent to the developer’s servers.

---

## Installation (unpacked)

### Variante A – Release-ZIP (empfohlen)

1. Neueste Version unter **[Releases](https://github.com/omgitsjan/instagram-follow-checker/releases)** laden  
   (z. B. [`instagram-follow-checker-v1.0.0.zip`](https://github.com/omgitsjan/instagram-follow-checker/releases/download/v1.0.0/instagram-follow-checker-v1.0.0.zip))  
2. ZIP entpacken  
3. Chrome → `chrome://extensions` → **Entwicklermodus** → **Entpackte Erweiterung laden**  
4. Den **entpackten Ordner** wählen  
5. [instagram.com](https://www.instagram.com) öffnen (eingeloggt) → Extension-Icon → **Analyse starten**

### Variante B – aus dem Repo

1. Repo klonen  
2. wie oben ab Schritt 3, Ordner des Repos laden  

Nach Code-Updates: auf der Extensions-Seite **Aktualisieren**, Instagram-Tab neu laden.

---

## Nutzung

1. Auf Instagram eingeloggt bleiben (Tab offen).  
2. Analyse starten und warten (bei vielen Followern dauert es – es gibt Pausen zwischen den Seiten).  
3. Tabs durchschauen, optional Folgen/Entfolgen.  
4. Bei Fehlern (429, Login): warten, neu laden, erneut versuchen.  

---

## Technik (kurz)

| Teil | Rolle |
|------|--------|
| `manifest.json` | MV3, Host-Permissions für Instagram + CDN |
| `content.js` | läuft auf `instagram.com`, holt Listen, Follow/Unfollow |
| `popup.*` | UI mit Tabs, Suche, Aktionen |

Daten bleiben im Browser (`chrome.storage.local` fürs letzte Ergebnis). Es werden **keine** Analyse-Daten an die Autoren dieses Repos gesendet.

---

## Einschränkungen

- Instagram ändert APIs/DOM → Extension kann **plötzlich** nicht mehr funktionieren  
- Rate-Limits / Blocks möglich  
- Sehr große Accounts = lange Laufzeit  
- Kein Multi-Account-Manager, kein Auto-Unfollow-Bot im Hintergrund  

---

## CI / Pipeline

Ja, sinnvoll – aber **schlank**, weil es **keinen Build** (kein npm/Webpack) und keinen Store-Deploy gibt.

| Workflow | Wann | Was |
|----------|------|-----|
| **CI** (`ci.yml`) | Push/PR auf `main` | Manifest & Dateien prüfen, JS-Syntax, ZIP-Artifact |
| **Release** (`release.yml`) | Tag `v*` (z. B. `v1.0.0`) | Validieren, Version = Tag, GitHub Release + ZIP |

Lokal prüfen:

```bash
node scripts/validate-extension.mjs
node --check content.js
node --check popup.js
```

Release-Beispiel (Version in `manifest.json` zuerst anheben):

```bash
git tag v1.0.0
git push origin v1.0.0
```

**Nicht** in der Pipeline: Chrome Web Store Upload (braucht Secrets, Review, und passt schlecht zu einem ToS-sensiblen Hobby-Tool).

---

## Lizenz

[MIT](./LICENSE) – plus die **Disclaimer** oben: Nutzung auf eigene Gefahr, **keine Haftung**, insbesondere nicht für Account-Maßnahmen durch Instagram/Meta.

---

## Contributing

PRs willkommen, aber ohne Garantie auf Review-Zeit. Bitte **keine** Features, die aggressives Massen-Spam-Verhalten erleichtern.

---

## Credits

- Vibe-coded with AI assistance  
- Author: [omgitsjan](https://github.com/omgitsjan)  

Wenn dir das hilft: Stern am Repo reicht als Danke. Bleib fair zu anderen Accounts – und lies die Warnings nochmal. ✌️
