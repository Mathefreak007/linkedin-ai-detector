# LinkedIn AI Detector

Chrome Extension + Azure Functions Backend zur Erkennung von KI-generierten LinkedIn-Posts.

## Struktur

```
linkedin-ai-detector/
├── extension/          # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── content/        # Content Script + CSS
│   ├── popup/          # Statistik-Popup
│   ├── background/     # Service Worker
│   └── utils/          # API, Cache, LinkedIn-Parser
├── backend/            # Azure Functions (Python)
│   ├── function_app.py # Endpoints: /api/detect, /api/detect-batch
│   └── detect/         # Prompts + Hilfsfunktionen
└── docs/
    └── solution-plan.md
```

## Quick Start

### Backend lokal starten

```bash
cd backend
pip install -r requirements.txt
# local.settings.json mit Azure OpenAI Credentials befüllen
func start
```

### Extension in Chrome laden

1. `chrome://extensions` öffnen
2. "Entwicklermodus" aktivieren
3. "Entpackte Erweiterung laden" → `extension/` Ordner auswählen
4. LinkedIn öffnen — Posts werden automatisch analysiert

## Konfiguration

`backend/local.settings.json` befüllen:
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI Resource URL
- `AZURE_OPENAI_KEY`: API Key
- `AZURE_OPENAI_DEPLOYMENT`: Deployment-Name (Standard: `gpt-4o-mini`)

Nach dem Deployment die `BASE_URL` in [extension/utils/api.js](extension/utils/api.js) auf die Azure Functions URL setzen.

## AI-Ampel

| Score | Farbe | Badge |
|---|---|---|
| 0–30% | 🟢 Grün | "Echt! (wahrscheinlich)" |
| 30–60% | 🟡 Gelb | "Hmm... 🤔" |
| 60–85% | 🟠 Orange | "GPT hat mitgeholfen" |
| 85–100% | 🔴 Rot | "STRG+V aus ChatGPT 🤖" |
