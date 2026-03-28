// popup.js — Popup-Logik: Statistiken anzeigen, Einstellungen

document.addEventListener('DOMContentLoaded', async () => {
  const toggleEnabled = document.getElementById('toggleEnabled');
  const toggleFunMode = document.getElementById('toggleFunMode');
  const statHeadline = document.getElementById('statHeadline');
  const barHuman = document.getElementById('barHuman');
  const barUncertain = document.getElementById('barUncertain');
  const barAI = document.getElementById('barAI');
  const countHuman = document.getElementById('countHuman');
  const countUncertain = document.getElementById('countUncertain');
  const countAI = document.getElementById('countAI');

  // Einstellungen laden
  const settings = await chrome.storage.local.get(['enabled', 'funMode']);
  toggleEnabled.checked = settings.enabled !== false;
  toggleFunMode.checked = settings.funMode !== false;

  // Stats vom Content Script anfragen
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_STATS' }, (stats) => {
        if (stats) updateStats(stats);
      });
    }
  } catch (e) {
    // Tab nicht erreichbar
  }

  // Live-Updates vom Content Script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'STATS_UPDATE') {
      updateStats(msg.stats);
    }
  });

  // Toggle: Extension ein/aus
  toggleEnabled.addEventListener('change', async () => {
    const value = toggleEnabled.checked;
    await chrome.storage.local.set({ enabled: value });
    sendToContent({ type: 'SET_ENABLED', value });
  });

  // Toggle: Fun-Modus
  toggleFunMode.addEventListener('change', async () => {
    const value = toggleFunMode.checked;
    await chrome.storage.local.set({ funMode: value });
    sendToContent({ type: 'SET_FUN_MODE', value });
  });

  function updateStats(stats) {
    const total = stats.total || 0;
    const ai = stats.ai || 0;
    const human = stats.human || 0;
    const uncertain = stats.uncertain || 0;

    countHuman.textContent = human;
    countUncertain.textContent = uncertain;
    countAI.textContent = ai;

    if (total === 0) {
      statHeadline.textContent = 'Warte auf Analyse...';
      barHuman.style.width = '0%';
      barUncertain.style.width = '0%';
      barAI.style.width = '0%';
      return;
    }

    const humanPct = Math.round((human / total) * 100);
    const uncertainPct = Math.round((uncertain / total) * 100);
    const aiPct = 100 - humanPct - uncertainPct;

    barHuman.style.width = `${humanPct}%`;
    barUncertain.style.width = `${uncertainPct}%`;
    barAI.style.width = `${Math.max(0, aiPct)}%`;

    if (ai === 0) {
      statHeadline.textContent = `${total} Posts analysiert — alles Mensch! 🎉`;
    } else {
      const aiPctDisplay = Math.round((ai / total) * 100);
      statHeadline.textContent = `${ai} von ${total} Posts verdächtig (${aiPctDisplay}% KI)`;
    }
  }

  async function sendToContent(msg) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  }
});
