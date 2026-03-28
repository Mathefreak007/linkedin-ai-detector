// linkedin-parser.js — DOM-Selektoren für LinkedIn Posts
// LinkedIn verwendet obfuskierte CSS-Klassen → strukturelle Navigation

const LinkedInParser = {

  findAllPosts() {
    // Strategie A: semantische Attribute (ältere LinkedIn-Versionen)
    const semantic = [
      ...[...document.querySelectorAll('article')],
      ...[...document.querySelectorAll('[data-id*="activity"],[data-id*="ugcPost"]')],
      ...[...document.querySelectorAll('[data-urn*="activity"],[data-urn*="ugcPost"]')],
      ...[...document.querySelectorAll('[data-view-name*="feed-full-update"],[data-view-name*="feed-update"]')],
    ].filter(el => this._isLikelyPost(el));

    if (semantic.length > 0) return [...new Set(semantic)];

    // Strategie B: Strukturelle Navigation für obfuskierte LinkedIn-Klassen
    return this._findPostsByStructure();
  },

  _findPostsByStructure() {
    const main = document.querySelector('[role="main"]');
    if (!main) return [];

    // Schritt 1: Finde die Hauptfeed-Spalte anhand des "Beitrag beginnen"-Landmarks
    const feedColumn = this._findFeedColumn(main);
    if (!feedColumn) return [];

    // Schritt 2: Gehe tiefer bis wir einen Container mit vielen Kinder-Posts finden
    const postList = this._findPostListContainer(feedColumn, 8);
    if (!postList) return [];

    // Schritt 3: Kinder des Post-Containers sind die Posts
    return [...postList.children].filter(el =>
      el.tagName === 'DIV' && this._isLikelyPost(el)
    );
  },

  // Findet die Hauptfeed-Spalte anhand des "Beitrag beginnen"-Landmarks
  _findFeedColumn(main) {
    const keywords = ['Beitrag beginnen', 'Start a post', 'Beitrag starten', 'Was bewegt dich', "What's on your mind"];
    const divs = main.querySelectorAll('div');
    let best = null;
    let bestLen = Infinity;
    for (const div of divs) {
      const text = div.innerText?.trim() || '';
      if (keywords.some(kw => text.includes(kw)) && text.length < bestLen) {
        bestLen = text.length;
        best = div;
      }
    }
    // Wenn Landmark gefunden: gehe hoch zum Feed-Column-Container
    if (best) {
      // Der eigentliche Feed-Spalten-Container ist ein Vorfahre
      let el = best.parentElement;
      for (let i = 0; i < 5 && el; i++) {
        // Sobald der Vorfahre selbst viele div-Kinder hat → das ist der Feed-Container
        const contentKids = [...(el.parentElement?.children || [])].filter(c =>
          c.innerText?.trim().length > 200
        );
        if (contentKids.length >= 2) return el;
        el = el.parentElement;
      }
      return best.parentElement;
    }
    return null;
  },

  // Geht tief in einen Container und findet die Ebene mit den meisten Post-Kandidaten
  _findPostListContainer(el, maxDepth) {
    if (maxDepth === 0 || !el) return null;

    const contentChildren = [...el.children].filter(c =>
      c.tagName === 'DIV' && (c.innerText?.trim().length || 0) > 100
    );

    // Wenn wir 3+ Kinder mit Inhalt finden: das ist die Post-Liste
    if (contentChildren.length >= 3) return el;

    // Sonst: tiefer in das Kind mit dem meisten Inhalt
    let richest = null, maxLen = 0;
    for (const child of el.children) {
      const len = child.innerText?.trim().length || 0;
      if (len > maxLen) { maxLen = len; richest = child; }
    }
    return richest ? this._findPostListContainer(richest, maxDepth - 1) : null;
  },

  _isLikelyPost(el) {
    const text = el.innerText?.trim() || '';
    // Muss echten Post-Text haben: nicht zu kurz, nicht zu lang (kein ganzer Feed)
    if (text.length < 100 || text.length > 15000) return false;
    // Darf nicht selbst innerhalb eines markierten Posts sein
    if (el.closest('[data-ai-detector-id]')) return false;
    return true;
  },

  extractText(postEl) {
    // Explizite Text-Selektoren
    const selectors = [
      '[class*="update-components-text"]',
      '[class*="feed-shared-inline-show-more"]',
      '[class*="attributed-text-segment-list"]',
      '[class*="break-words"]',
      '.update-components-text',
      '.feed-shared-text',
      '[class*="commentary"]',
    ];
    for (const sel of selectors) {
      try {
        const el = postEl.querySelector(sel);
        const t = el?.innerText?.trim();
        if (t && t.length > 50) return t;
      } catch (e) { /* weiter */ }
    }

    // dir="ltr" — LinkedIn setzt das für Post-Texte
    let best = '';
    postEl.querySelectorAll('[dir="ltr"]').forEach(el => {
      const t = el.innerText?.trim() || '';
      if (t.length > best.length && t.length < 5000) best = t;
    });
    if (best.length > 50) return best;

    // Letzter Fallback: längster einfacher Text-Block
    postEl.querySelectorAll('span, p').forEach(el => {
      if (el.children.length < 5) {
        const t = el.innerText?.trim() || '';
        if (t.length > best.length && t.length < 5000) best = t;
      }
    });
    return best.length > 50 ? best : null;
  },

  extractAuthor(postEl) {
    const selectors = ['[class*="actor__name"]', '[class*="update-components-actor"]'];
    for (const sel of selectors) {
      try {
        const el = postEl.querySelector(sel);
        const t = el?.innerText?.trim();
        if (t) return t;
      } catch (e) { /* weiter */ }
    }
    return 'Unbekannt';
  },

  detectLanguage(text) {
    const germanWords = ['und', 'die', 'der', 'das', 'ist', 'ich', 'wir', 'für', 'mit', 'auf', 'nicht'];
    const lowerText = text.toLowerCase();
    const matches = germanWords.filter(w => lowerText.includes(` ${w} `)).length;
    return matches >= 2 ? 'de' : 'en';
  },

  diagnose() {
    console.group('[AIDetector] Diagnose');
    const posts = this.findAllPosts();
    console.log(`Posts gefunden: ${posts.length}`);
    posts.slice(0, 3).forEach((p, i) => {
      const text = this.extractText(p);
      console.log(`Post ${i + 1}: text="${(text || '–').slice(0, 80)}"`);
    });
    if (posts.length === 0) {
      const main = document.querySelector('[role="main"]');
      const feedCol = main ? this._findFeedColumn(main) : null;
      const postList = feedCol ? this._findPostListContainer(feedCol, 8) : null;
      console.table({
        '[role="main"]': main ? 1 : 0,
        'feed column': feedCol ? 1 : 0,
        'post list container': postList ? 1 : 0,
        'post list children': postList?.children.length ?? 0,
      });
    }
    console.groupEnd();
  },
};
