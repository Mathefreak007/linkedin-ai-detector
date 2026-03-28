// linkedin-parser.js — DOM-Selektoren für LinkedIn Posts
// LinkedIn verwendet obfuskierte CSS-Klassen → nur strukturelle/semantische Selektoren

const LinkedInParser = {

  findAllPosts() {
    const found = new Set();

    // Strategie 1: <article> Elemente (semantisch stabil, LinkedIn benutzt sie für Feed-Posts)
    document.querySelectorAll('article').forEach(el => {
      if (this._isLikelyPost(el)) found.add(el);
    });

    // Strategie 2: data-id mit activity-URN (LinkedIn interne IDs)
    document.querySelectorAll('[data-id*="activity"],[data-id*="ugcPost"],[data-id*="share"]').forEach(el => {
      if (this._isLikelyPost(el)) found.add(el);
    });

    // Strategie 3: data-urn (ältere LinkedIn-Struktur, könnte noch vorhanden sein)
    document.querySelectorAll('[data-urn*="activity"],[data-urn*="ugcPost"]').forEach(el => {
      if (this._isLikelyPost(el)) found.add(el);
    });

    // Strategie 4: data-view-name (neuere LinkedIn-Struktur)
    document.querySelectorAll('[data-view-name*="feed"],[data-view-name*="post"],[data-view-name*="update"]').forEach(el => {
      if (this._isLikelyPost(el)) found.add(el);
    });

    // Strategie 5: li-Elemente im Feed mit genug Text (struktureller Fallback)
    if (found.size === 0) {
      document.querySelectorAll('main li, [role="main"] li').forEach(el => {
        if (this._isLikelyPost(el)) found.add(el);
      });
    }

    return Array.from(found);
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
      const main = document.querySelector('main, [role="main"]');
      const stats = {
        'article': document.querySelectorAll('article').length,
        '[data-id]': document.querySelectorAll('[data-id]').length,
        '[data-urn]': document.querySelectorAll('[data-urn]').length,
        '[data-view-name]': document.querySelectorAll('[data-view-name]').length,
        'main li': document.querySelectorAll('main li').length,
      };
      console.table(stats);
      if (main) {
        console.log('main/role=main gefunden:', main.tagName, main.className.slice(0, 80));
        [...main.children].slice(0, 3).forEach((c, i) =>
          console.log(`  Kind ${i}: ${c.tagName} class="${c.className.slice(0, 80)}"`)
        );
      }
    }
    console.groupEnd();
  },
};
