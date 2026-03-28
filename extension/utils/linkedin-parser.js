// linkedin-parser.js — DOM-Selektoren für LinkedIn Posts
// LinkedIn ändert regelmäßig seine DOM-Struktur — Selektoren hier zentral halten

const LinkedInParser = {
  // Post-Container: von spezifisch → generisch, mehrere Fallbacks
  POST_SELECTORS: [
    // Aktuelle LinkedIn-Struktur (2024-2026)
    '[data-urn*="urn:li:activity"]',
    '[data-id*="urn:li:activity"]',
    // Ältere Klassen-basierte Selektoren
    '.feed-shared-update-v2',
    '.occludable-update',
    // Generischer Fallback: Feed-Items mit Artikel-Struktur
    '.scaffold-finite-scroll__content > div > div',
  ],

  // Text-Inhalt: alle bekannten Varianten
  TEXT_SELECTORS: [
    // Aktuell (2025+)
    '[class*="update-components-text"]',
    '[class*="feed-shared-inline-show-more"]',
    '[class*="attributed-text-segment-list"]',
    // Ältere Varianten
    '.update-components-text',
    '.feed-shared-update-v2__description',
    '.feed-shared-text',
    '[class*="commentary"]',
    // Letzter Fallback: span mit viel Text im Post
    'span[dir="ltr"]',
  ],

  AUTHOR_SELECTORS: [
    '[class*="update-components-actor__name"]',
    '.update-components-actor__name',
    '.feed-shared-actor__name',
  ],

  findAllPosts() {
    const found = new Set();
    for (const selector of this.POST_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach(el => {
          // Nur echte Post-Container: müssen Text-Kind-Element haben
          if (this._hasTextContent(el)) found.add(el);
        });
      } catch (e) { /* ungültiger Selektor — überspringen */ }
    }
    return Array.from(found);
  },

  _hasTextContent(el) {
    // Grober Check: Element muss genug Text enthalten um ein Post zu sein
    return el && el.innerText && el.innerText.trim().length > 50;
  },

  extractText(postEl) {
    for (const selector of this.TEXT_SELECTORS) {
      try {
        const el = postEl.querySelector(selector);
        if (el && el.innerText.trim().length > 30) {
          return el.innerText.trim();
        }
      } catch (e) { /* überspringen */ }
    }
    // Letzter Fallback: längsten Text-Block im Post nehmen
    return this._extractLongestText(postEl);
  },

  _extractLongestText(postEl) {
    let best = '';
    postEl.querySelectorAll('span, p').forEach(el => {
      const t = el.innerText?.trim() || '';
      if (t.length > best.length && t.length < 3000) best = t;
    });
    return best.length > 30 ? best : null;
  },

  extractAuthor(postEl) {
    for (const selector of this.AUTHOR_SELECTORS) {
      try {
        const el = postEl.querySelector(selector);
        if (el?.innerText?.trim()) return el.innerText.trim();
      } catch (e) { /* überspringen */ }
    }
    return 'Unbekannt';
  },

  detectLanguage(text) {
    const germanWords = ['und', 'die', 'der', 'das', 'ist', 'ich', 'wir', 'für', 'mit', 'auf', 'nicht'];
    const lowerText = text.toLowerCase();
    const matches = germanWords.filter(w => lowerText.includes(` ${w} `)).length;
    return matches >= 2 ? 'de' : 'en';
  },

  // Diagnose: in der Browser-Console aufrufen um Selektoren zu debuggen
  diagnose() {
    console.group('[AIDetector] Diagnose');
    const posts = this.findAllPosts();
    console.log(`Posts gefunden: ${posts.length}`);
    posts.slice(0, 3).forEach((p, i) => {
      const text = this.extractText(p);
      console.log(`Post ${i+1}: tag=${p.tagName} class="${p.className.slice(0,60)}" text="${(text||'').slice(0,80)}"`);
    });
    if (posts.length === 0) {
      console.warn('Keine Posts gefunden. Aktuelle DOM-Infos:');
      // Zeige was im Feed-Bereich wirklich da ist
      const feed = document.querySelector('.scaffold-finite-scroll__content, main, [role="main"]');
      if (feed) {
        console.log('Feed-Container:', feed.className);
        const children = Array.from(feed.children).slice(0, 5);
        children.forEach((c, i) => console.log(`  Kind ${i}: ${c.tagName} class="${c.className.slice(0,80)}"`));
      }
    }
    console.groupEnd();
  },
};
