# LinkedIn AI-Detektor — Lösungsplan

## 1. Projektübersicht

**Idee:** Chrome Extension, die auf LinkedIn AI-generierte Posts erkennt und visuell markiert.
**Ziel:** Wow-Effekt bei LinkedIn-Präsentation, Expertise demonstrieren, Humor einbauen.
**Scope:** MVP — nur für eigene Nutzung, keine Userverwaltung.

---

## 2. Architektur

```
┌─────────────────────────┐     HTTPS/JSON      ┌──────────────────────────┐
│   Chrome Extension      │ ──────────────────▶  │   Azure Backend          │
│                         │                      │                          │
│  • Content Script       │  { text, lang }      │  • Azure Functions       │
│    (LinkedIn DOM lesen) │ ◀──────────────────  │    (Python/FastAPI)      │
│                         │  { score, label,     │                          │
│  • Overlay/Badge rendern│    explanation }      │  • Azure OpenAI Service  │
│                         │                      │    (GPT-4o-mini)         │
│  • Popup (Statistiken)  │                      │                          │
└─────────────────────────┘                      └──────────────────────────┘
```

### Warum diese Architektur?

| Entscheidung | Begründung |
|---|---|
| **Azure Functions** statt App Service | Pay-per-execution, günstiger für MVP, kein Leerlauf-Kosten |
| **GPT-4o-mini** statt GPT-4o | 10-20x günstiger, für Klassifikation ausreichend |
| **Backend statt direkt API** | API-Key nicht im Extension-Code, Rate-Limiting, Prompt zentral verwaltbar |
| **Content Script** statt Service Worker | Direkter DOM-Zugriff auf LinkedIn nötig |

---

## 3. Komponenten im Detail

### 3.1 Chrome Extension (Frontend)

**Manifest V3** (Pflicht für neue Extensions)

**Bestandteile:**

- **Content Script** (`content.js`)
  - Wird auf `linkedin.com` injiziert
  - Findet Posts im DOM über Selektoren (`.feed-shared-update-v2`, `.update-components-text`)
  - Nutzt `IntersectionObserver` — analysiert nur sichtbare Posts
  - Sendet Text an Backend, empfängt Score
  - Rendert visuelles Overlay pro Post

- **Popup** (`popup.html/js`)
  - Zeigt Statistiken der aktuellen Seite: "7 von 12 Posts sind verdächtig 🤖"
  - Toggle: Extension ein/aus
  - Fun-Modus: Humorvolle Kommentare aktivieren

- **Background Service Worker** (`background.js`)
  - Verwaltet Extension-State
  - Caching der Ergebnisse (gleicher Post → kein erneuter API-Call)
  - Rate-Limiting auf Client-Seite

**Visuelles Konzept — die "AI-Ampel":**

```
Score 0-30%:   🟢 Grüner dezenter Rand    → "Sieht menschlich aus"
Score 30-60%:  🟡 Gelber Rand             → "Hmm, verdächtig..."
Score 60-85%:  🟠 Oranger Rand + Badge    → "Riecht nach Prompt"
Score 85-100%: 🔴 Roter Rand + Badge      → "ChatGPT war hier 🤖"
```

Zusätzlich: Kleines Badge oben rechts am Post mit Prozent-Wert.
On-Hover: Tooltip mit witziger Erklärung.

### 3.2 Azure Backend

**Azure Functions (Python + FastAPI/Function-Bindings)**

**Endpoints:**

**1. Single-Analyse:** `POST /api/detect`
```json
Request:
{
  "text": "Der LinkedIn-Post-Text...",
  "lang": "de"
}

Response:
{
  "score": 0.87,
  "label": "likely_ai",
  "explanation": "Perfekte Struktur, generische Buzzwords, null Persönlichkeit.",
  "humor": "Dieser Post wurde mit 87% Wahrscheinlichkeit von einer KI geschrieben. Die restlichen 13% sind der Copy-Paste-Button."
}
```

**2. Batch-Analyse (Haupt-Endpoint):** `POST /api/detect-batch`
```json
Request:
{
  "posts": [
    { "id": "hash_abc123", "text": "Post 1 Text...", "lang": "de" },
    { "id": "hash_def456", "text": "Post 2 Text...", "lang": "en" }
  ]
}

Response:
{
  "results": [
    { "id": "hash_abc123", "score": 0.87, "label": "likely_ai",
      "explanation": "...", "humor": "..." },
    { "id": "hash_def456", "score": 0.12, "label": "human",
      "explanation": "...", "humor": "..." }
  ]
}
```

Der Batch-Endpoint ist der primäre Weg — er reduziert die Latenz erheblich,
weil der System-Prompt und der Netzwerk-Overhead nur einmal anfallen.
Batch-Größe: max. 5 Posts pro Call.

**Kategorien:**
- `human` (0-0.3)
- `uncertain` (0.3-0.6)
- `likely_ai` (0.6-0.85)
- `ai_generated` (0.85-1.0)

### 3.3 Azure OpenAI — Prompt-Design

Der Prompt ist das Herzstück. Hier ein bewährter Ansatz:

```
SYSTEM:
Du bist ein Experte für die Erkennung von KI-generierten Texten.
Analysiere den folgenden Text und bewerte, wie wahrscheinlich er von einer KI
(wie ChatGPT, Claude, etc.) generiert wurde.

Achte auf diese Signale:
- Übermäßig perfekte Struktur und Formatierung
- Generische Phrasen und Buzzwords ohne persönliche Note
- Gleichförmiger Satzbau und Rhythmus
- Fehlende persönliche Anekdoten oder spezifische Details
- Typische KI-Muster: "In der heutigen schnelllebigen Welt...",
  "Es ist wichtig zu beachten...", "Zusammenfassend lässt sich sagen..."
- Emoji-Overload in Kombination mit perfekter Grammatik
- LinkedIn-Bro-Sprech kombiniert mit KI-Glätte

Antworte NUR mit einem JSON-Objekt:
{
  "score": <float 0.0-1.0>,
  "signals": ["signal1", "signal2", ...],
  "explanation": "<kurze sachliche Erklärung>",
  "humor": "<witziger Einzeiler zum Ergebnis>"
}

USER:
Sprache: {lang}
Text: {text}
```

**Wichtig:** GPT-4o-mini liefert hier solide Ergebnisse. Die Erkennung basiert
auf stilistischen Mustern, nicht auf Wasserzeichen — daher nie 100% sicher.
Das kommunizieren wir transparent und humorvoll.

---

## 4. Performance-Strategie

### ⚠️ Latenz-Realität (ehrliche Einschätzung)

GPT-4o-mini ist das schnellste Azure OpenAI Modell, aber "schnell" für ein LLM
heißt nicht "instant":

| Szenario | Typische Latenz |
|---|---|
| Single Call (Best Case) | ~500ms |
| Single Call (Typisch) | 800ms–1,5s |
| Single Call (Worst Case, Last-Spitzen) | 2–5s |

**Konsequenz:** Naives "1 Post = 1 Call" bei 10 Posts = 5-15s Wartezeit.
Das ist inakzeptabel. → Deshalb die folgenden Optimierungen.

### 4.1 Batching — mehrere Posts pro API-Call

**Kernidee:** Statt 10 einzelne Requests schicken wir 3-5 Posts gebündelt
in einem einzigen Call. Das spart Netzwerk-Overhead und der System-Prompt
wird nur einmal verarbeitet.

**Backend-Endpoint erweitert:**
```
POST /api/detect-batch
{
  "posts": [
    { "id": "post_1", "text": "Text von Post 1...", "lang": "de" },
    { "id": "post_2", "text": "Text von Post 2...", "lang": "en" },
    { "id": "post_3", "text": "Text von Post 3...", "lang": "de" }
  ]
}

Response:
{
  "results": [
    { "id": "post_1", "score": 0.87, "label": "likely_ai", ... },
    { "id": "post_2", "score": 0.23, "label": "human", ... },
    { "id": "post_3", "score": 0.65, "label": "likely_ai", ... }
  ]
}
```

**Prompt-Anpassung für Batching:**
```
Analysiere die folgenden Texte einzeln. Antworte mit einem JSON-Array.
Jedes Element enthält die id und die Bewertung.

Texte:
[1] id=post_1 | Sprache: de | "Text..."
[2] id=post_2 | Sprache: en | "Text..."
```

**Batch-Größe:** 3-5 Posts optimal (darüber wird der Prompt zu lang und
die Antwortqualität sinkt). Bei 5 Posts: ~1,5-2,5s statt 5×1s = 5s.

### 4.2 Progressive Darstellung (UX-Kernstrategie)

**Prinzip:** Nicht warten bis alles fertig ist. Der Nutzer sieht sofort
Aktivität, nicht Leere.

**Ablauf für jeden Post:**
```
1. Post wird sichtbar → Sofort Shimmer-Overlay einblenden
   (pulsierender Gradient + "🔍 Wird analysiert..." Text)

2. API-Ergebnis kommt → Smooth Transition (300ms CSS fade):
   Shimmer → Farbiger Rand + Score-Badge

3. Hover → Tooltip mit Erklärung + Humor-Text fade-in
```

**CSS-Shimmer-Animation:**
```css
.ai-detector-analyzing {
  position: relative;
  overflow: hidden;
}
.ai-detector-analyzing::after {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 200%; height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(59, 130, 246, 0.08),
    transparent
  );
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  100% { transform: translateX(50%); }
}
```

**Warum das für den Wow-Effekt BESSER ist als Instant:**
Der Zuschauer sieht die KI "arbeiten". Das pulsieren signalisiert:
"Hier passiert etwas Intelligentes." Das ist bei einer Demo eindrucksvoller
als wenn die Ergebnisse sofort da wären.

### 4.3 Viewport-First + Prefetching

**IntersectionObserver mit Vorlauf:**
```javascript
// Nicht nur sichtbare Posts, sondern auch die nächsten ~3 darunter
const observer = new IntersectionObserver(
  (entries) => { /* Post zur Analyse-Queue hinzufügen */ },
  {
    rootMargin: '0px 0px 600px 0px'  // 600px UNTER dem Viewport vorladen
  }
);
```

**Scroll-Verhalten → Analyse-Erlebnis:**
```
Seite laden:    Posts 1-5 sichtbar → Batch 1 sofort abschicken
                Posts 6-8 im Vorlauf → Batch 2 parallel vorbereiten

Langsam scrollen: Posts 6-8 sind schon fertig → sofort markiert (0ms!)
                  Posts 9-11 werden jetzt vorgeladen

Schnell scrollen: Kurzer Shimmer (~1-2s), dann Markierung
                  Debounce verhindert API-Überflutung
```

### 4.4 Client-seitiges Caching

**Zwei Cache-Ebenen:**

```javascript
// Level 1: Session-Cache (im Memory, schnellster Zugriff)
const sessionCache = new Map(); // key: textHash → value: result

// Level 2: Persistenter Cache (chrome.storage.local, überlebt Tab-Reload)
// key: SHA-256 Hash der ersten 500 Zeichen des Post-Texts
// TTL: 24 Stunden
```

**Hash-Strategie:**
```javascript
async function hashText(text) {
  // Normalisieren: Whitespace, Lowercase für stabilen Hash
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 500);
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized)
  );
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Effekt:** Beim erneuten Laden der LinkedIn-Seite sind die meisten Posts
sofort markiert (0ms aus Cache). Nur neue Posts brauchen API-Calls.

### 4.5 Backend-Optimierung

```
- max_tokens: 150 (wir brauchen nur Score + kurze Erklärung)
  → Weniger generierte Tokens = direkt weniger Latenz
- temperature: 0.3 (konsistentere Ergebnisse, weniger Token-"Nachdenken")
- response_format: { type: "json_object" } (erzwingt valides JSON)
- Azure Region: West Europe oder Sweden Central (nah an Deutschland)
- Deployment: "Global Standard" (automatisches Routing zum besten DC)
```

### 4.6 Server-seitiges Caching (MVP)

```
- Text-Hash als Cache-Key (identisch zum Client-Hash)
- MVP: Python dict (In-Memory, reicht für Azure Functions)
- Später: Azure Table Storage oder Redis
- TTL: 24h
- Vorteil: Wenn ein viraler Post von vielen gesehen wird,
  wird er nur 1x analysiert
```

### 4.7 Realistisches Nutzererlebnis nach Optimierung

| Szenario | Gefühlte Wartezeit | Was der Nutzer sieht |
|---|---|---|
| Seite laden, erste 5 Posts | 1-2s | Shimmer → progressive Markierung |
| Langsam scrollen | 0-0,5s | Posts meist schon vorgeladen |
| Schnell scrollen | 1-2s | Kurzer Shimmer, dann Markierung |
| Seite erneut laden | 0s | Sofort aus Cache |
| Post schon von anderem analysiert | 0s | Server-Cache-Hit |

---

## 5. Kostenabschätzung (MVP)

| Posten | Schätzung/Monat |
|---|---|
| Azure Functions (Consumption Plan) | ~0-1€ (1 Mio Calls/Monat frei) |
| Azure OpenAI GPT-4o-mini | ~2-5€ (bei ~1000 Posts/Tag) |
| Azure Table Storage (Cache) | ~0,10€ |
| **Gesamt** | **~2-6€/Monat** |

Berechnung: ~500 Tokens/Post × 0,15$/1M Input-Tokens × 1000 Posts ≈ 0,075$/Tag

---

## 6. Tech Stack

| Komponente | Technologie |
|---|---|
| Extension | Manifest V3, Vanilla JS (kein Framework nötig) |
| Styling | CSS (in Content Script injiziert) |
| Backend | Python 3.11+ mit Azure Functions v2 |
| AI Model | Azure OpenAI GPT-4o-mini |
| Caching | Azure Table Storage (oder dict für MVP) |
| Deployment | Azure Functions Core Tools / VS Code Extension |
| Dev-Tool | Claude Code in VS Code |

---

## 7. Umsetzungsplan (Phasen)

### Phase 1: Backend aufsetzen (Tag 1)
- [ ] Azure OpenAI Resource erstellen, GPT-4o-mini deployen (Region: West Europe)
- [ ] Azure Functions Projekt (Python) aufsetzen
- [ ] `/api/detect` Endpoint implementieren (Single-Post)
- [ ] `/api/detect-batch` Endpoint implementieren (3-5 Posts)
- [ ] Server-seitiges In-Memory-Caching (Text-Hash → Ergebnis)
- [ ] Prompt entwickeln und mit Beispiel-Posts testen
- [ ] `max_tokens: 150`, `temperature: 0.3`, `response_format: json_object`
- [ ] Lokal testen mit `func start`

### Phase 2: Chrome Extension Grundgerüst (Tag 1-2)
- [ ] Manifest V3 Setup
- [ ] Content Script: LinkedIn-Posts im DOM finden
- [ ] Shimmer-Animation als sofortiger Loading-State
- [ ] API-Anbindung an Backend (Batch-Endpoint)
- [ ] Basis-Overlay (farbiger Rand nach Score) rendern
- [ ] Lokal testen in Chrome

### Phase 3: Performance & Caching (Tag 2)
- [ ] IntersectionObserver mit 600px Vorlauf (Prefetching)
- [ ] Client-Cache: Session-Cache (Map) + Persistent (chrome.storage)
- [ ] Text-Hash-Funktion (SHA-256, normalisiert)
- [ ] Batch-Queue: Posts sammeln, alle 500ms als Batch abschicken
- [ ] Debounce beim schnellen Scrollen
- [ ] Progressive Darstellung: Shimmer → Fade-In der Ergebnisse

### Phase 4: UX & Wow-Faktor (Tag 2-3)
- [ ] AI-Ampel mit Farbverlauf (🟢🟡🟠🔴)
- [ ] Badge mit Prozent-Wert (oben rechts am Post)
- [ ] Tooltip mit Erklärung + Humor-Text (on hover)
- [ ] Popup mit Seitenstatistik ("67% Mensch, 33% Maschine")
- [ ] Smooth CSS Transitions (300ms fade)

### Phase 5: Demo-Ready (Tag 3-4)
- [ ] Backend auf Azure deployen
- [ ] End-to-End testen (Extension → Azure → Ergebnis)
- [ ] Edge Cases abfangen (leere Posts, Bilder-only, Artikel-Links)
- [ ] Error-Handling: Timeout → "Analyse fehlgeschlagen" statt Crash
- [ ] Fun-Modus mit extra witzigen Kommentaren
- [ ] Extension-Icon designen (Roboter mit Lupe? 🤖🔍)
- [ ] Screenshots / Screenrecording für LinkedIn-Post erstellen

---

## 8. Humor-Konzept (Wow-Faktor)

### Badge-Texte je nach Score:
- 🟢 0-30%: "Echt! (wahrscheinlich)"
- 🟡 30-60%: "Hmm... 🤔"
- 🟠 60-85%: "GPT hat mitgeholfen"
- 🔴 85-100%: "STRG+V aus ChatGPT 🤖"

### Tooltip-Texte (zufällig rotierend):
- "Dieser Post hat mehr KI als ein Tesla."
- "Thought Leadership™ powered by OpenAI."
- "Authentizität: 404 Not Found."
- "Der Post wurde in 3.2 Sekunden geschrieben. Respekt."
- "Fun Fact: Auch diese Analyse wurde von KI gemacht. 🤷"

### Popup-Statistik:
- "Dein Feed heute: 67% Mensch, 33% Maschine"
- Balkendiagramm mit menschlich vs. KI-Anteil
- "KI-freieste Person in deinem Feed: [Name]" (falls technisch machbar)

---

## 9. Bekannte Risiken & Mitigationen

| Risiko | Mitigation |
|---|---|
| LinkedIn ändert DOM-Struktur | Selektoren modular halten, schnell anpassbar |
| Falsch-Positive (Mensch als KI erkannt) | Score als Wahrscheinlichkeit kommunizieren, nie "definitiv KI" sagen |
| Falsch-Negative (KI nicht erkannt) | Transparent sein: "Kein Werkzeug ist perfekt" |
| LinkedIn blockiert Extension | Unwahrscheinlich bei reinem DOM-Lesen, kein Scraping |
| API-Kosten explodieren | Client-seitiges Rate-Limiting + Cache |
| API-Latenz zu hoch (>2s) | Batching, Caching, Shimmer-UX, Region West Europe |
| Azure OpenAI kurzzeitig degradiert | Graceful Degradation: "Analyse vorübergehend nicht verfügbar" |

---

## 10. Projektstruktur für Claude Code

```
linkedin-ai-detector/
├── extension/                  # Chrome Extension
│   ├── manifest.json
│   ├── content/
│   │   ├── content.js          # DOM-Parsing & Overlay
│   │   └── content.css         # Styling der Overlays
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── background/
│   │   └── service-worker.js
│   ├── utils/
│   │   ├── api.js              # Backend-Kommunikation
│   │   ├── cache.js            # Client-Cache
│   │   └── linkedin-parser.js  # DOM-Selektoren
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
│
├── backend/                    # Azure Functions
│   ├── function_app.py         # Hauptdatei
│   ├── detect/
│   │   ├── __init__.py
│   │   └── prompts.py          # Prompt-Templates
│   ├── requirements.txt
│   ├── host.json
│   └── local.settings.json
│
├── docs/
│   └── solution-plan.md        # Dieses Dokument
│
└── README.md
```

---

## 11. Workflow mit Claude Code in VS Code

### Setup (einmalig, 2 Minuten)

```bash
# 1. Projektordner erstellen
mkdir linkedin-ai-detector
cd linkedin-ai-detector

# 2. Diesen Lösungsplan als Datei ablegen
mkdir docs
# → solution-plan.md in docs/ ablegen

# 3. In VS Code öffnen
code .
```

Das war's. Keine weitere manuelle Struktur nötig.

### Arbeitsweise mit Claude Code

Claude Code kann alles aus diesem Plan umsetzen — Verzeichnisse anlegen,
Dateien erstellen, Code schreiben, testen, iterieren. Der Workflow:

**Schritt 1 — Projekt-Kickoff:**
```
Lies docs/solution-plan.md. Erstelle die komplette Projektstruktur
(alle Ordner und Basis-Dateien) gemäß Abschnitt 10.
```

**Schritt 2 — Backend (Phase 1):**
```
Setze Phase 1 um: Erstelle das Azure Functions Backend (Python)
mit den Endpoints /api/detect und /api/detect-batch.
Nutze die Prompt-Templates aus Abschnitt 3.3.
Erstelle eine local.settings.json mit Platzhaltern für Azure OpenAI Keys.
```

**Schritt 3 — Extension (Phase 2):**
```
Setze Phase 2 um: Erstelle die Chrome Extension mit Manifest V3.
Content Script soll LinkedIn-Posts finden und an das Backend senden.
Implementiere die Shimmer-Animation aus Abschnitt 4.2 als Loading-State.
```

**Schritt 4 — UX & Performance (Phase 3+4):**
```
Implementiere die Performance-Optimierungen aus Abschnitt 4:
Batching, IntersectionObserver mit Prefetch, Client-Cache,
und die AI-Ampel mit allen Farbstufen und Humor-Texten.
```

### Tipps für die Claude Code Session

- **Immer auf den Plan verweisen** — Claude Code hat Kontext, wenn es die
  solution-plan.md liest. Je spezifischer der Verweis, desto besser.
- **Inkrementell arbeiten** — Eine Phase nach der anderen. Nach jeder Phase
  kurz testen, dann weiter.
- **Lokal testen** — Backend: `func start` im backend/-Ordner.
  Extension: `chrome://extensions` → "Entpackte Erweiterung laden" → extension/-Ordner.
- **Wenn was nicht klappt** — Fehlermeldung an Claude Code geben,
  es kann debuggen und fixen.

### Bevor wir starten, brauchst du:

1. **Azure-Account** mit aktivem Subscription
2. **Azure OpenAI** Zugang (ggf. beantragen falls noch nicht vorhanden)
3. **Node.js** installiert (für Extension-Tooling)
4. **Python 3.11+** installiert
5. **Azure Functions Core Tools** installiert (`npm i -g azure-functions-core-tools@4`)
6. **VS Code** mit Claude Code Extension

---

*Plan erstellt: März 2026 | Stack: Chrome Extension + Azure Functions + GPT-4o-mini*
