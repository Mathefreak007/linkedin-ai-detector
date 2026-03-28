// service-worker.js — Background Service Worker
// Verwaltet Extension-State, leitet Nachrichten weiter

// Extension installiert / aktualisiert
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true, funMode: true });
  console.log('[AIDetector] Extension installiert.');
});

// Nachrichten zwischen Popup und Content Script weiterleiten
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Stats-Updates vom Content Script an alle Popups
  if (msg.type === 'STATS_UPDATE') {
    // Wird direkt per chrome.runtime.sendMessage weitergegeben
    return false;
  }
  return false;
});
