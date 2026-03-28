// linkedin-parser.js — DOM-Selektoren für LinkedIn Posts
// LinkedIn ändert regelmäßig seine DOM-Struktur — Selektoren hier zentral halten

const LinkedInParser = {
  // Primäre Selektoren für Feed-Posts
  POST_SELECTORS: [
    '.feed-shared-update-v2',
    '[data-urn*="urn:li:activity"]',
    '.occludable-update',
  ],

  // Text-Inhalt eines Posts
  TEXT_SELECTORS: [
    '.update-components-text',
    '.feed-shared-update-v2__description',
    '.feed-shared-text',
    '[class*="commentary"]',
  ],

  // Post-Autor
  AUTHOR_SELECTORS: [
    '.update-components-actor__name',
    '.feed-shared-actor__name',
  ],

  /**
   * Findet alle Post-Container im aktuellen DOM.
   * @returns {HTMLElement[]}
   */
  findAllPosts() {
    const found = new Set();
    for (const selector of this.POST_SELECTORS) {
      document.querySelectorAll(selector).forEach(el => found.add(el));
    }
    return Array.from(found);
  },

  /**
   * Extrahiert den Text-Inhalt aus einem Post-Element.
   * @param {HTMLElement} postEl
   * @returns {string|null}
   */
  extractText(postEl) {
    for (const selector of this.TEXT_SELECTORS) {
      const el = postEl.querySelector(selector);
      if (el && el.innerText.trim().length > 30) {
        return el.innerText.trim();
      }
    }
    return null;
  },

  /**
   * Extrahiert den Autornamen aus einem Post-Element.
   * @param {HTMLElement} postEl
   * @returns {string}
   */
  extractAuthor(postEl) {
    for (const selector of this.AUTHOR_SELECTORS) {
      const el = postEl.querySelector(selector);
      if (el && el.innerText.trim()) {
        return el.innerText.trim();
      }
    }
    return 'Unbekannt';
  },

  /**
   * Erkennt die Sprache des Texts (einfache Heuristik).
   * @param {string} text
   * @returns {'de'|'en'}
   */
  detectLanguage(text) {
    const germanWords = ['und', 'die', 'der', 'das', 'ist', 'ich', 'wir', 'für', 'mit', 'auf', 'nicht'];
    const lowerText = text.toLowerCase();
    const germanMatches = germanWords.filter(w => lowerText.includes(` ${w} `)).length;
    return germanMatches >= 2 ? 'de' : 'en';
  },
};
