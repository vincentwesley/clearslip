import { LISTS } from "./compiler/types.ts";
import { loadMaps } from "./lib/maps";
import { groupMatches, type Maps } from "./lib/matched";
import { hostFromUrl } from "./lib/site";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

try {
  if (localStorage.getItem("theme") === "light") document.documentElement.dataset.theme = "light";
} catch {
  /* dark default */
}

// `?url=` and `?tabId=` let tests point the popup at a page; the popup is only reachable from this extension.
const params = new URLSearchParams(location.search);

async function currentTab(): Promise<{ id?: number; url?: string; windowId?: number; incognito?: boolean }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = params.get("url") ?? tab?.url;
  const id = params.has("tabId") ? Number(params.get("tabId")) : tab?.id;
  return { id: Number.isInteger(id) ? id : undefined, url, windowId: tab?.windowId, incognito: tab?.incognito };
}

async function loadMatched(tabId: number) {
  try {
    const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId });
    const matches = rulesMatchedInfo.filter((m) => m.rule.rulesetId !== "_dynamic");
    return { matches, maps: await loadMaps([...new Set(matches.map((m) => m.rule.rulesetId))]) };
  } catch (e) {
    console.warn("Hush: could not read matched rules", e);
    return null;
  }
}

function renderGroups(maps: Maps, matches: chrome.declarativeNetRequest.MatchedRuleInfo[]): void {
  const { total, groups } = groupMatches(matches, maps);
  $("total").textContent = String(total);
  $("empty").hidden = total > 0;
  const ul = $("groups");
  ul.replaceChildren(
    ...groups.map((g) => {
      const li = document.createElement("li");
      const name = Object.assign(document.createElement("span"), { className: "name", textContent: g.label });
      const count = Object.assign(document.createElement("span"), { className: "count", textContent: String(g.count) });
      const list = Object.assign(document.createElement("span"), { className: "list", textContent: LISTS[g.list].name });
      li.append(name, count, list);
      return li;
    }),
  );
}

async function main(): Promise<void> {
  const { id, url, windowId, incognito } = await currentTab();
  const host = hostFromUrl(url);
  $("about").addEventListener("click", () => {
    const opts = windowId === undefined ? {} : { windowId };
    void chrome.sidePanel.open(opts as { windowId: number }).then(() => window.close(), console.error);
  });
  if (!host) {
    $("host").textContent = "This page";
    $("unsupported").hidden = false;
    return;
  }
  $("host").textContent = host;

  const toggle = $<HTMLButtonElement>("toggle");
  const error = $("error");
  const fail = (msg: string): void => {
    error.textContent = msg;
    error.hidden = false;
  };
  const showPaused = (paused: boolean): void => {
    toggle.setAttribute("aria-checked", String(paused)); // switch on = Hush paused here
    $("state").textContent = paused ? `Paused on ${host}` : "Hush is on";
    $("zap").hidden = paused || !!incognito; // nothing to hide while paused; zaps are never saved from private windows
  };
  const matched = id === undefined ? Promise.resolve(null) : loadMatched(id); // starts now, in parallel with getState
  let state: { ok?: boolean; off?: string[] } | undefined;
  try {
    state = (await chrome.runtime.sendMessage({ type: "getState" })) as typeof state;
  } catch {
    state = undefined;
  }
  if (!state?.ok) {
    fail("Hush could not load its settings. Close this popup and open it again.");
    return; // controls stay hidden: no unlabeled live switch
  }
  showPaused(!!state.off?.includes(host));
  $("controls").hidden = false;
  toggle.addEventListener("click", async () => {
    const wasPaused = toggle.getAttribute("aria-checked") === "true";
    toggle.disabled = true;
    error.hidden = true;
    try {
      const res = (await chrome.runtime.sendMessage({ type: "setSiteOff", host, off: !wasPaused })) as { ok?: boolean; reason?: string } | undefined;
      if (res?.ok) {
        showPaused(!wasPaused);
        if (id !== undefined) await chrome.tabs.reload(id).catch(console.warn); // apply now
      } else {
        showPaused(wasPaused);
        fail(res?.reason === "limit" ? "Too many sites are switched off (limit 1,000). Turn Hush back on for one first." : "Could not change this site. Try again.");
      }
    } catch {
      showPaused(wasPaused);
      fail("Could not change this site. Try again.");
    } finally {
      toggle.disabled = false;
      toggle.focus();
    }
  });
  $("zap").addEventListener("click", async () => {
    if (id === undefined) return;
    const res = (await chrome.runtime.sendMessage({ type: "startPicker", tabId: id }).catch(() => undefined)) as { ok?: boolean } | undefined;
    if (res?.ok) window.close();
    else fail("Could not start the picker on this page. Try reloading it.");
  });
  const data = await matched; // loadMatched never rejects; null = could not read
  if (data) renderGroups(data.maps, data.matches);
  else if (id !== undefined) {
    const empty = $("empty");
    empty.textContent = "Could not read what was blocked on this page.";
    empty.hidden = false;
  }
}

main().catch(() => {
  const e = $("error");
  e.textContent = "Hush could not start. Close this popup and open it again.";
  e.hidden = false;
});

