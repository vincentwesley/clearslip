import type { RuleMap } from "../compiler/types.ts";
import type { Maps } from "./matched";

/** Build-time rule maps for the given rulesets (packaged files, not network requests). */
export async function loadMaps(ids: string[]): Promise<Maps> {
  const maps: Maps = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        maps[id] = (await (await fetch(chrome.runtime.getURL(`rulesets/map-${id}.json`))).json()) as RuleMap;
      } catch {
        maps[id] = [];
      }
    }),
  );
  return maps;
}
