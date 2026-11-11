import { LIST_NAME, groupMatches, type Maps, type MapEntry } from "./lib/matched";
import { hostFromUrl } from "./lib/site";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

try {
  if (localStorage.getItem("theme") === "light") document.documentElement.dataset.theme = "light";
} catch {
  /* dark default */
}

// `?url=` and `?tabId=` let tests point the popup at a page; the popup is only reachable from this extension.
const params = new URLSearchParams(location.search);

async function currentTab(): Promise<{ id?: number; url?: string; windowId?: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = params.get("url") ?? tab?.url;
  const id = params.has("tabId") ? Number(params.get("tabId")) : tab?.id;
  return { id: Number.isInteger(id) ? id : undefined, url, windowId: tab?.windowId };
}

async function loadMaps(ids: string[]): Promise<Maps> {
  const maps: Maps = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        // Packaged extension file, not a network request.
        maps[id] = (await (await fetch(chrome.runtime.getURL(`rulesets/map-${id}.json`))).json()) as (MapEntry | null)[];
      } catch {
        maps[id] = [];
      }
    }),
  );
  return maps;
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
      const list = Object.assign(document.createElement("span"), { className: "list", textContent: LIST_NAME[g.list] });
      li.append(name, count, list);
      return li;
    }),
  );
}

async function main(): Promise<void> {
  const { id, url, windowId } = await currentTab();
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
  $("controls").hidden = false;

  const toggle = $<HTMLButtonElement>("toggle");
  const label = $("toggle-label");
  const showOn = (on: boolean): void => {
    toggle.setAttribute("aria-checked", String(on));
    label.textContent = on ? "Hush is on for this site" : "Hush is off for this site";
  };
  const state = (await chrome.runtime.sendMessage({ type: "getState" })) as { ok?: boolean; off?: string[] } | undefined;
  showOn(!state?.off?.includes(host));
  toggle.addEventListener("click", async () => {
    const wantOn = toggle.getAttribute("aria-checked") !== "true";
    toggle.disabled = true;
    const res = (await chrome.runtime.sendMessage({ type: "setSiteOff", host, off: !wantOn })) as { ok?: boolean } | undefined;
    toggle.disabled = false;
    if (res?.ok) {
      showOn(wantOn);
      $("reload").hidden = false;
    }
    toggle.focus();
  });

  if (id === undefined) return;
  try {
    const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId: id });
    const matches = rulesMatchedInfo.filter((m) => m.rule.rulesetId !== "_dynamic");
    const maps = await loadMaps([...new Set(matches.map((m) => m.rule.rulesetId))]);
    renderGroups(maps, matches);
  } catch (e) {
    console.warn("Hush: could not read matched rules", e);
  }
}

void main();

