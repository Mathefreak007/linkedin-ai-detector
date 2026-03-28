// cache.js — Zwei-Ebenen-Cache für Analyse-Ergebnisse

const AIDetectorCache = {
  // Level 1: Session-Cache (In-Memory, schnellster Zugriff)
  _sessionCache: new Map(),

  // TTL: 24 Stunden in Millisekunden
  TTL_MS: 24 * 60 * 60 * 1000,

  /**
   * Erzeugt einen stabilen SHA-256 Hash aus dem Post-Text.
   * Normalisiert Whitespace und Case für konsistente Keys.
   * @param {string} text
   * @returns {Promise<string>}
   */
  async hashText(text) {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 500);
    const buffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(normalized)
    );
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * Liest ein Ergebnis aus dem Cache (Session → Persistent).
   * @param {string} hash
   * @returns {Promise<object|null>}
   */
  async get(hash) {
    // Level 1: Session-Cache
    if (this._sessionCache.has(hash)) {
      return this._sessionCache.get(hash);
    }

    // Level 2: Persistenter Cache
    try {
      const stored = await chrome.storage.local.get(hash);
      if (stored[hash]) {
        const entry = stored[hash];
        if (Date.now() - entry.timestamp < this.TTL_MS) {
          this._sessionCache.set(hash, entry.result); // in Session-Cache hochkopieren
          return entry.result;
        }
        // Abgelaufen — löschen
        chrome.storage.local.remove(hash);
      }
    } catch (e) {
      console.warn('[AIDetector] Cache-Lesefehler:', e);
    }

    return null;
  },

  /**
   * Speichert ein Ergebnis in beiden Cache-Ebenen.
   * @param {string} hash
   * @param {object} result
   */
  async set(hash, result) {
    this._sessionCache.set(hash, result);

    try {
      await chrome.storage.local.set({
        [hash]: { result, timestamp: Date.now() },
      });
    } catch (e) {
      console.warn('[AIDetector] Cache-Schreibfehler:', e);
    }
  },

  /**
   * Leert den Session-Cache (z.B. beim Deaktivieren der Extension).
   */
  clearSession() {
    this._sessionCache.clear();
  },
};
