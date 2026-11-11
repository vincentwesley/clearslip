// Clicking the toolbar icon opens the side panel. No other behaviour, no network.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
