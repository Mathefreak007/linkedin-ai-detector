# prompts.py — Prompt-Templates für die AI-Erkennung

SYSTEM_PROMPT_SINGLE = """Du bist ein Experte für die Erkennung von KI-generierten Texten.
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
  "signals": ["signal1", "signal2"],
  "explanation": "<kurze sachliche Erklärung, max. 100 Zeichen>",
  "humor": "<witziger Einzeiler zum Ergebnis>"
}"""

SYSTEM_PROMPT_BATCH = """Du bist ein Experte für die Erkennung von KI-generierten Texten.
Analysiere die folgenden Texte einzeln und bewerte jeweils, wie wahrscheinlich
sie von einer KI (wie ChatGPT, Claude, etc.) generiert wurden.

Achte auf diese Signale:
- Übermäßig perfekte Struktur und Formatierung
- Generische Phrasen und Buzzwords ohne persönliche Note
- Gleichförmiger Satzbau und Rhythmus
- Fehlende persönliche Anekdoten oder spezifische Details
- Typische KI-Muster: "In der heutigen schnelllebigen Welt...",
  "Es ist wichtig zu beachten...", "Zusammenfassend lässt sich sagen..."
- Emoji-Overload in Kombination mit perfekter Grammatik

Antworte NUR mit einem JSON-Objekt mit einem "results"-Array:
{
  "results": [
    {
      "id": "<id aus der Eingabe>",
      "score": <float 0.0-1.0>,
      "signals": ["signal1", "signal2"],
      "explanation": "<kurze sachliche Erklärung, max. 100 Zeichen>",
      "humor": "<witziger Einzeiler zum Ergebnis>"
    }
  ]
}"""

HUMOR_FALLBACKS = [
    "Dieser Post wurde mit hoher Wahrscheinlichkeit von einer KI geschrieben. Die restlichen % sind der Copy-Paste-Button.",
    "Thought Leadership™ powered by OpenAI.",
    "Authentizität: 404 Not Found.",
    "Der Post wurde in 3.2 Sekunden geschrieben. Respekt.",
    "Fun Fact: Auch diese Analyse wurde von KI gemacht. 🤷",
    "Dieser Post hat mehr KI als ein Tesla.",
]


def build_single_user_prompt(text: str, lang: str) -> str:
    return f"Sprache: {lang}\nText: {text}"


def build_batch_user_prompt(posts: list[dict]) -> str:
    lines = ["Analysiere die folgenden Texte:\n"]
    for i, post in enumerate(posts, 1):
        lines.append(f"[{i}] id={post['id']} | Sprache: {post['lang']} | \"{post['text'][:1000]}\"")
    return "\n".join(lines)


def score_to_label(score: float) -> str:
    if score >= 0.85:
        return "ai_generated"
    if score >= 0.60:
        return "likely_ai"
    if score >= 0.30:
        return "uncertain"
    return "human"
