// Asks the service worker to inject cosmetic CSS for this frame. Never reads or touches the page.
chrome.runtime.sendMessage({ type: "cosmetic" }).catch(() => undefined);