// Minimal DNR types, defined here so the compiler never depends on @types/chrome.
export type ListId = "easylist" | "easyprivacy";

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

export interface MapEntry {
  l: ListId;
  f: string[];
}

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
}

export interface CompileResult {
  rulesets: Record<"compact" | "detail-easylist" | "detail-easyprivacy", DnrRule[]>;
  maps: Record<"compact" | "detail-easylist" | "detail-easyprivacy", (MapEntry | null)[]>;
  report: Report;
}
