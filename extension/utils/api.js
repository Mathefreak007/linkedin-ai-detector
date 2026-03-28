// api.js — Kommunikation mit dem Azure Functions Backend

const AIDetectorAPI = {
  // In Produktion: Azure Functions URL
  // Lokal: http://localhost:7071
  BASE_URL: 'http://localhost:7071',

  TIMEOUT_MS: 10000,

  /**
   * Analysiert mehrere Posts in einem Batch-Call.
   * Batch-Größe: max. 5 Posts (laut Plan).
   * @param {Array<{id: string, text: string, lang: string}>} posts
   * @returns {Promise<Array<{id, score, label, explanation, humor}>>}
   */
  async detectBatch(posts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(`${this.BASE_URL}/api/detect-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.results;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('[AIDetector] Timeout nach', this.TIMEOUT_MS, 'ms');
      } else {
        console.error('[AIDetector] API-Fehler:', err.message);
      }
      // Graceful Degradation: Fehler-Ergebnisse für alle Posts
      return posts.map(p => ({
        id: p.id,
        score: null,
        label: 'error',
        explanation: 'Analyse vorübergehend nicht verfügbar.',
        humor: null,
      }));
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Analysiert einen einzelnen Post.
   * @param {string} text
   * @param {string} lang
   * @returns {Promise<{score, label, explanation, humor}>}
   */
  async detectSingle(text, lang = 'de') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(`${this.BASE_URL}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.error('[AIDetector] API-Fehler:', err.message);
      return { score: null, label: 'error', explanation: 'Fehler', humor: null };
    } finally {
      clearTimeout(timeout);
    }
  },
};
