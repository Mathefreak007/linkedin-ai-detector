// content.js — Haupt-Content-Script
// Läuft auf linkedin.com, findet Posts, analysiert sie, rendert Overlays

(async () => {
  // --- State ---
  const analysisQueue = []; // Posts die analysiert werden müssen
  const processing = new Set(); // Post-Hashes aktuell in Bearbeitung
  const pageStats = { total: 0, ai: 0, human: 0, uncertain: 0 };

  let isEnabled = true;
  let isFunMode = true;
  let batchTimer = null;

  // Extension-State aus Storage laden
  const settings = await chrome.storage.local.get(['enabled', 'funMode']);
  isEnabled = settings.enabled !== false;
  isFunMode = settings.funMode !== false;

  if (!isEnabled) return;

  console.log('[AIDetector] ✅ Script geladen. Suche Posts...');
  // Diagnose-Funktion: LinkedInParser.diagnose() in Console aufrufen

  // --- IntersectionObserver mit 600px Vorlauf (Prefetching) ---
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const postEl = entry.target;
          observer.unobserve(postEl);
          enqueuePost(postEl);
        }
      });
    },
    { rootMargin: '0px 0px 600px 0px' }
  );

  // --- Posts beobachten (initial + bei DOM-Änderungen) ---
  function observeNewPosts() {
    const posts = LinkedInParser.findAllPosts();
    if (posts.length > 0) {
      console.log(`[AIDetector] ${posts.length} Post(s) gefunden`);
    } else {
      LinkedInParser.diagnose();
    }
    posts.forEach(postEl => {
      if (!postEl.dataset.aiDetectorId) {
        postEl.dataset.aiDetectorId = 'pending';
        observer.observe(postEl);
      }
    });
  }

  // MutationObserver für dynamisch geladene Posts (Infinite Scroll)
  const mutationObserver = new MutationObserver(() => observeNewPosts());
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  observeNewPosts();

  // --- Post zur Analyse-Queue hinzufügen ---
  async function enqueuePost(postEl) {
    const text = LinkedInParser.extractText(postEl);
    if (!text) return;

    const hash = await AIDetectorCache.hashText(text);
    postEl.dataset.aiDetectorId = hash;

    // Aus Cache laden?
    const cached = await AIDetectorCache.get(hash);
    if (cached) {
      applyResult(postEl, cached);
      return;
    }

    if (processing.has(hash)) return;

    // Shimmer sofort anzeigen
    showShimmer(postEl);

    const lang = LinkedInParser.detectLanguage(text);
    analysisQueue.push({ id: hash, text, lang, el: postEl });

    // Batch-Timer: 500ms debounce, dann Batch abschicken
    clearTimeout(batchTimer);
    batchTimer = setTimeout(flushQueue, 500);
  }

  // --- Batch verarbeiten ---
  async function flushQueue() {
    if (analysisQueue.length === 0) return;

    // Maximal 5 Posts pro Batch
    const batch = analysisQueue.splice(0, 5);
    batch.forEach(item => processing.add(item.id));

    const posts = batch.map(({ id, text, lang }) => ({ id, text, lang }));
    const results = await AIDetectorAPI.detectBatch(posts);

    results.forEach(result => {
      const item = batch.find(b => b.id === result.id);
      if (!item) return;

      processing.delete(result.id);
      AIDetectorCache.set(result.id, result);
      applyResult(item.el, result);
      updatePageStats(result.label);
    });

    // Wenn noch Posts in der Queue, weiter batchen
    if (analysisQueue.length > 0) {
      batchTimer = setTimeout(flushQueue, 100);
    }

    // Popup über neue Stats informieren
    notifyPopup();
  }

  // --- Shimmer-Overlay anzeigen ---
  function showShimmer(postEl) {
    postEl.classList.add('ai-detector-analyzing');

    const badge = document.createElement('div');
    badge.className = 'ai-detector-badge ai-detector-badge--loading';
    badge.textContent = '🔍';
    badge.title = 'Wird analysiert...';
    postEl.style.position = 'relative';
    postEl.appendChild(badge);
  }

  // --- Ergebnis auf Post anwenden ---
  function applyResult(postEl, result) {
    postEl.classList.remove('ai-detector-analyzing');

    // Bestehende Badges entfernen
    postEl.querySelectorAll('.ai-detector-badge').forEach(b => b.remove());
    postEl.classList.remove(
      'ai-detector--human',
      'ai-detector--uncertain',
      'ai-detector--likely-ai',
      'ai-detector--ai'
    );

    if (result.label === 'error' || result.score === null) {
      return; // Fehler — kein Overlay
    }

    // CSS-Klasse nach Score
    const cssClass = scoreToCssClass(result.score);
    postEl.classList.add(cssClass);
    postEl.style.position = 'relative';

    // Badge erstellen
    const badge = document.createElement('div');
    badge.className = `ai-detector-badge ai-detector-badge--${result.label}`;
    badge.textContent = scoreToBadgeText(result.score, result.label, isFunMode);

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'ai-detector-tooltip';
    tooltip.innerHTML = `
      <div class="ai-detector-tooltip__score">${Math.round(result.score * 100)}% KI-Wahrscheinlichkeit</div>
      <div class="ai-detector-tooltip__explanation">${result.explanation || ''}</div>
      ${isFunMode && result.humor ? `<div class="ai-detector-tooltip__humor">${result.humor}</div>` : ''}
    `;

    badge.appendChild(tooltip);
    postEl.appendChild(badge);
  }

  // --- Hilfsfunktionen ---
  function scoreToCssClass(score) {
    if (score >= 0.85) return 'ai-detector--ai';
    if (score >= 0.60) return 'ai-detector--likely-ai';
    if (score >= 0.30) return 'ai-detector--uncertain';
    return 'ai-detector--human';
  }

  function scoreToBadgeText(score, label, funMode) {
    const pct = Math.round(score * 100);
    if (!funMode) return `${pct}%`;

    if (score >= 0.85) return `${pct}% · STRG+V aus ChatGPT 🤖`;
    if (score >= 0.60) return `${pct}% · GPT hat mitgeholfen`;
    if (score >= 0.30) return `${pct}% · Hmm... 🤔`;
    return `${pct}% · Echt!`;
  }

  function updatePageStats(label) {
    pageStats.total++;
    if (label === 'ai_generated' || label === 'likely_ai') pageStats.ai++;
    else if (label === 'human') pageStats.human++;
    else pageStats.uncertain++;
  }

  function notifyPopup() {
    chrome.runtime.sendMessage({ type: 'STATS_UPDATE', stats: pageStats }).catch(() => {
      // Popup ist geschlossen — kein Fehler
    });
  }

  // Nachrichten vom Popup empfangen
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GET_STATS') {
      return Promise.resolve(pageStats);
    }
    if (msg.type === 'SET_ENABLED') {
      isEnabled = msg.value;
    }
    if (msg.type === 'SET_FUN_MODE') {
      isFunMode = msg.value;
    }
  });

})();
