import type { CosmeticReport, CosmeticResult } from "./cosmetic.ts";

// Minimal DNR types, defined here so the compiler never depends on @types/chrome.
// Single source for list and ruleset ids; the manifest, build and runtime all derive from these.
export const LIST_IDS = ["easylist", "easyprivacy"] as const;
export type ListId = (typeof LIST_IDS)[number];
export const LISTS: Record<ListId, { name: string; url: string }> = {
  easylist: { name: "EasyList", url: "https://easylist.to/easylist/easylist.txt" },
  easyprivacy: { name: "EasyPrivacy", url: "https://easylist.to/easylist/easyprivacy.txt" },
};

export const DETAIL_IDS = ["detail-easylist", "detail-easyprivacy"] as const;
export const RULESET_IDS = ["compact", ...DETAIL_IDS] as const;
export type RulesetId = (typeof RULESET_IDS)[number];

export type RuleActionType = "block" | "allow" | "allowAllRequests";

export interface DnrCondition {
  urlFilter?: string;
  regexFilter?: string;
  isUrlFilterCaseSensitive?: boolean;
  resourceTypes?: string[];
  excludedResourceTypes?: string[];
  domainType?: "firstParty" | "thirdParty";
  initiatorDomains?: string[];
  excludedInitiatorDomains?: string[];
  requestDomains?: string[];
}

export interface DnrRule {
  id: number;
  priority: number;
  action: { type: RuleActionType };
  condition: DnrCondition;
}

/** A parsed network filter (ABP syntax), already normalised (ASCII, lowercase domains, DNR type names). */
export interface Filter {
  raw: string;
  list: ListId;
  exception: boolean;
  kind: "url" | "regex";
  pattern: string; // urlFilter text or regex source (no slashes); may be "" when domains are given
  types: string[]; // DNR resource types (include); may contain main_frame
  notTypes: string[];
  thirdParty: boolean | null; // true = thirdParty, false = firstParty
  domains: string[];
  notDomains: string[];
  matchCase: boolean;
  important: boolean;
  badfilter: boolean;
  document: boolean; // exception with $document -> allowAllRequests
}

export type ParseResult = { ok: true; filter: Filter } | { ok: false; reason: string };

/** A rule before ids are assigned. */
export type RuleBody = Omit<DnrRule, "id">;

/** `map-detail-*.json`: index = rule id (0 is null), entry = the original filter text. */
export type DetailMap = (string | null)[];
/** `map-compact.json`: index = rule id (0 is null), entry = [index into LIST_IDS, merged filter count, first filter]. */
export type CompactMap = ([number, number, string] | null)[];
export type RuleMap = DetailMap | CompactMap;

export interface ListInput {
  id: ListId;
  text: string;
}

export interface SourceInfo {
  id: string;
  url: string;
  fetchedAt: string;
  sha256: string;
  lines: number;
}

export interface Report {
  generatedAt: string;
  sources: SourceInfo[];
  perList: Record<string, { parsed: number; converted: number; skipped: Record<string, number> }>;
  rulesets: Record<string, { rules: number; regexRules: number }>;
  compactCut: number;
  cosmetic: CosmeticReport;
}

export interface CompileResult {
  cosmetic: CosmeticResult;
  rulesets: Record<RulesetId, DnrRule[]>;
  maps: Record<RulesetId, RuleMap>;
  report: Report;
}
