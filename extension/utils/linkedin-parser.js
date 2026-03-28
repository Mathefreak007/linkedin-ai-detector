// linkedin-parser.js — DOM-Selektoren für LinkedIn Posts
// LinkedIn verwendet obfuskierte CSS-Klassen → nur strukturelle/semantische Selektoren

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

    // Strategie B: LinkedIn verwendet obfuskierte Klassen → strukturell traversieren.
    // Aufbau: [role="main"] → Scroll-Container → Feed-Liste → Post-Kinder
    return this._findPostsByStructure();
  },

  _findPostsByStructure() {
    const main = document.querySelector('[role="main"]');
    if (!main) return [];

    // Gehe maximal 4 Ebenen tief und suche den Container mit den meisten Kinder-Divs
    const feedContainer = this._findFeedContainer(main, 4);
    if (!feedContainer) return [];

    // Jedes direkte Kind mit genug Text ist ein Post-Kandidat
    const posts = [];
    for (const child of feedContainer.children) {
      if (child.tagName === 'DIV' && this._isLikelyPost(child)) {
        posts.push(child);
      }
    }

    // Falls nichts direkt, eine Ebene tiefer suchen
    if (posts.length === 0) {
      for (const child of feedContainer.children) {
        for (const grandchild of child.children) {
          if (grandchild.tagName === 'DIV' && this._isLikelyPost(grandchild)) {
            posts.push(grandchild);
          }
        }
      }
    }

    return posts;
  },

  _findFeedContainer(el, depth) {
    if (depth === 0) return null;
    // Der Feed-Container hat viele Kinder (Posts) — typisch > 3
    let best = null;
    let bestCount = 2; // Minimum
    for (const child of el.children) {
      const divChildren = [...child.children].filter(c => c.tagName === 'DIV').length;
      if (divChildren > bestCount) {
        bestCount = divChildren;
        best = child;
      }
      // Rekursiv in das Kind mit den meisten Div-Kindern schauen
      const deeper = this._findFeedContainer(child, depth - 1);
      if (deeper) {
        const deeperCount = [...deeper.children].filter(c => c.tagName === 'DIV').length;
        if (deeperCount > bestCount) {
          bestCount = deeperCount;
          best = deeper;
        }
      }
    }
    return best;
  },

  _isLikelyPost(el) {
    // Muss genug Text haben um ein Post zu sein
    const text = el.innerText?.trim() || '';
    if (text.length < 80) return false;
    // Darf nicht selbst Kind eines bereits erkannten Posts sein
    // (verhindert, dass wir verschachtelte Elemente doppelt zählen)
    if (el.closest('[data-ai-detector-id]')) return false;
    return true;
  },

  extractText(postEl) {
    // Strategie 1: Explizite Text-Selektoren (wenn noch vorhanden)
    const explicitSelectors = [
      '[class*="update-components-text"]',
      '[class*="feed-shared-inline-show-more"]',
      '[class*="attributed-text-segment-list"]',
      '[class*="break-words"]',
      '.update-components-text',
      '.feed-shared-text',
      '[class*="commentary"]',
    ];
    for (const sel of explicitSelectors) {
      try {
        const el = postEl.querySelector(sel);
        const t = el?.innerText?.trim();
        if (t && t.length > 50) return t;
      } catch (e) { /* weiter */ }
    }

    // Strategie 2: Längstes span[dir="ltr"] — LinkedIn verwendet dir="ltr" für Post-Text
    let best = '';
    postEl.querySelectorAll('span[dir="ltr"], div[dir="ltr"]').forEach(el => {
      const t = el.innerText?.trim() || '';
      if (t.length > best.length && t.length < 5000) best = t;
    });
    if (best.length > 50) return best;

    // Strategie 3: Längster Text-Block (letzter Fallback)
    postEl.querySelectorAll('span, p').forEach(el => {
      // Nur direkte Text-Elemente, keine tief verschachtelten Container
      if (el.children.length < 5) {
        const t = el.innerText?.trim() || '';
        if (t.length > best.length && t.length < 5000) best = t;
      }
    });
    return best.length > 50 ? best : null;
  },

  extractAuthor(postEl) {
    const selectors = [
      '[class*="actor__name"]',
      '[class*="update-components-actor"]',
      '[class*="feed-shared-actor"]',
    ];
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
      console.log(`Post ${i+1}: tag=${p.tagName} text="${(text||'–').slice(0,80)}"`);
    });
    if (posts.length === 0) {
      console.warn('Keine Posts gefunden. DOM-Snapshot:');
      const main = document.querySelector('[role="main"]');
      console.table({
        'article': document.querySelectorAll('article').length,
        '[data-id]': document.querySelectorAll('[data-id]').length,
        '[data-urn]': document.querySelectorAll('[data-urn]').length,
        '[data-view-name]': document.querySelectorAll('[data-view-name]').length,
        '[role="main"]': main ? 1 : 0,
      });
      if (main) {
        const feed = this._findFeedContainer(main, 4);
        console.log('Feed-Container gefunden:', feed ? `${feed.tagName} mit ${feed.children.length} Kindern` : 'NEIN');
        if (feed) {
          [...feed.children].slice(0, 3).forEach((c, i) => {
            const txt = c.innerText?.trim().slice(0, 60) || '';
            console.log(`  Post-Kandidat ${i}: ${c.tagName} children=${c.children.length} text="${txt}"`);
          });
        }
      }
    }
    console.groupEnd();
  },
};
