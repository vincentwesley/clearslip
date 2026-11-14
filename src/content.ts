// Asks the service worker to inject cosmetic CSS for this frame. Never reads or touches the page.
chrome.runtime.sendMessage({ type: "cosmetic" }).catch(() => undefined);
// A back/forward-cache restore never re-requests the page, so tell the worker to reset this tab's receipt (top frame only).
addEventListener("pageshow", (e) => {
  if (e.isTrusted && e.persisted && window === top) chrome.runtime.sendMessage({ type: "bfcacheRestore", url: location.href }).catch(() => undefined);
});
