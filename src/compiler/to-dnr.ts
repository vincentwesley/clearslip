import type { DnrCondition, Filter, RuleBody } from "./types.ts";

export const PRIORITY = { block: 1, allow: 2, important: 3 } as const;

export function toRule(f: Filter): RuleBody {
  const c: DnrCondition = {};
  if (f.kind === "regex") c.regexFilter = f.pattern;
  else if (f.pattern !== "") c.urlFilter = f.pattern;
  c.isUrlFilterCaseSensitive = f.matchCase;
  if (f.document) c.resourceTypes = ["main_frame", "sub_frame"];
  else {
    const inc = f.types.filter((t) => !f.notTypes.includes(t));
    if (inc.length) c.resourceTypes = [...new Set(inc)];
    // DNR: excludedResourceTypes alone also matches main_frame, so exclude it explicitly.
    else if (f.notTypes.length) c.excludedResourceTypes = [...new Set([...f.notTypes, "main_frame"])];
  }
  if (f.thirdParty !== null) c.domainType = f.thirdParty ? "thirdParty" : "firstParty";
  if (f.domains.length) c.initiatorDomains = f.domains;
  if (f.notDomains.length) c.excludedInitiatorDomains = f.notDomains;
  if (f.exception) {
    return { priority: PRIORITY.allow, action: { type: f.document ? "allowAllRequests" : "allow" }, condition: c };
  }
  return { priority: f.important ? PRIORITY.important : PRIORITY.block, action: { type: "block" }, condition: c };
}
