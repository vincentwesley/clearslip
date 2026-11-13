import { describe, expect, it } from "vitest";
import { buildSelector, looksStable, type Ctx, type El } from "../../src/lib/selector";

// A tiny DOM: just enough selector matching (tag, #id, .class, :nth-of-type, ` > `) to test the generator.
class N implements El {
  parentElement: N | null = null;
  kids: N[] = [];
  tagName: string;
  id: string;
  classList: string[];
  constructor(tagName: string, id = "", classList: string[] = []) {
    this.tagName = tagName;
    this.id = id;
    this.classList = classList;
  }
  add(...c: N[]): this {
    for (const k of c) {
      k.parentElement = this;
      this.kids.push(k);
    }
    return this;
  }
  get previousElementSibling(): N | null {
    const s = this.parentElement?.kids ?? [];
    return s[s.indexOf(this) - 1] ?? null;
  }
  get nextElementSibling(): N | null {
    const s = this.parentElement?.kids ?? [];
    return s[s.indexOf(this) + 1] ?? null;
  }
}
const esc = (s: string): string => s.replace(/[^\w-]/g, (c) => `\\${c}`);
const unesc = (s: string): string => s.replace(/\\(.)/g, "$1");

function matchStep(n: N, step: string): boolean {
  const m = /^([a-z0-9]*)((?:[.#](?:\\.|[\w-])+)*)(?::nth-of-type\((\d+)\))?$/.exec(step);
  if (!m) return false;
  if (m[1] && m[1] !== n.tagName.toLowerCase()) return false;
  for (const [, kind, name] of m[2].matchAll(/([.#])((?:\\.|[\w-])+)/g)) {
    if (kind === "#" ? n.id !== unesc(name) : !n.classList.includes(unesc(name))) return false;
  }
  if (m[3]) {
    const same = (n.parentElement?.kids ?? []).filter((k) => k.tagName === n.tagName);
    if (same.indexOf(n) + 1 !== Number(m[3])) return false;
  }
  return true;
}
function world(root: N): Ctx {
  const all: N[] = [];
  const walk = (n: N): void => {
    all.push(n);
    n.kids.forEach(walk);
  };
  walk(root);
  return {
    escape: esc,
    query: (sel) => {
      const steps = sel.split(" > ");
      return all.filter((n) => {
        let cur: N | null = n;
        for (let i = steps.length - 1; i >= 0; i--, cur = cur?.parentElement ?? null) if (!cur || !matchStep(cur, steps[i])) return false;
        return true;
      });
    },
  };
}
const page = (...c: N[]): { html: N; body: N } => {
  const body = new N("BODY").add(...c);
  return { html: new N("HTML").add(body), body };
};

describe("looksStable", () => {
  it("rejects generated-looking names", () => {
    expect(looksStable("sidebar")).toBe(true);
    expect(looksStable("ad-banner_top")).toBe(true);
    expect(looksStable("item1234")).toBe(false);
    expect(looksStable("a1b2c3d4e5f6a7b8c9")).toBe(false);
    expect(looksStable("css-1x2y3z")).toBe(false);
    expect(looksStable("")).toBe(false);
  });
});

describe("buildSelector", () => {
  it("prefers a unique stable id", () => {
    const t = new N("DIV", "promo", ["x"]);
    const { html } = page(t, new N("DIV", "other"));
    expect(buildSelector(t, world(html))).toBe("#promo");
  });
  it("skips an unstable id and uses classes", () => {
    const t = new N("DIV", "box-123456", ["ad-slot", "wide"]);
    const { html } = page(t, new N("DIV", "", ["other"]));
    expect(buildSelector(t, world(html))).toBe("div.ad-slot.wide");
  });
  it("skips a duplicated id", () => {
    const t = new N("DIV", "dup", ["a"]);
    const { html } = page(t, new N("DIV", "dup", ["b"]));
    expect(buildSelector(t, world(html))).toBe("div.a");
  });
  it("uses at most 3 stable classes", () => {
    const t = new N("DIV", "", ["a", "b", "x12345", "c", "d"]);
    const { html } = page(t);
    expect(buildSelector(t, world(html))).toBe("div.a.b.c");
  });
  it("adds nth-of-type only when a sibling looks the same", () => {
    const a = new N("LI", "", ["it"]);
    const b = new N("LI", "", ["it"]);
    const c = new N("LI", "", ["special"]);
    const ul = new N("UL", "list").add(a, b, c);
    const { html } = page(ul);
    const w = world(html);
    expect(buildSelector(b, w)).toBe("li.it:nth-of-type(2)");
    expect(buildSelector(c, w)).toBe("li.special");
  });
  it("climbs ancestors until unique, stopping at a stable id", () => {
    const t1 = new N("A", "", ["go"]);
    const t2 = new N("A", "", ["go"]);
    const s1 = new N("SECTION", "left").add(new N("DIV", "", ["card"]).add(t1));
    const s2 = new N("SECTION", "right").add(new N("DIV", "", ["card"]).add(t2));
    const { html } = page(s1, s2);
    expect(buildSelector(t2, world(html))).toBe("#right > div.card > a.go");
  });
  it("gives up past 4 levels and never selects html/body", () => {
    let leaf = new N("SPAN");
    const t = leaf;
    for (let i = 0; i < 6; i++) leaf = new N("DIV").add(leaf);
    const { html, body } = page(leaf, new N("DIV").add(new N("DIV").add(new N("DIV").add(new N("DIV").add(new N("DIV").add(new N("SPAN")))))));
    expect(buildSelector(t, world(html))).toBeNull();
    expect(buildSelector(body, world(html))).toBeNull();
    expect(buildSelector(html, world(html))).toBeNull();
  });
  it("escapes odd class names and ids", () => {
    const t = new N("DIV", "", ["w-1/2", "md:flex", "a.b"]);
    const { html } = page(t);
    const sel = buildSelector(t, world(html));
    expect(sel).toBe("div.w-1\\/2.md\\:flex.a\\.b");
  });
  it("gives up on odd tag names", () => {
    for (const name of ['a"]', "x:y", "a(b)", "1a"]) {
      const t = new N(name);
      expect(buildSelector(t, world(page(t).html))).toBeNull();
    }
  });
  it("rejects a selector that is too long or unsafe", () => {
    const long = new N("DIV", "", ["a".repeat(40), "b".repeat(40), "c".repeat(40)]);
    const t = new N("P", "", ["z".repeat(40)]);
    let cur: N = t;
    for (let i = 0; i < 4; i++) cur = new N("DIV", "", [`${"x".repeat(38)}${i}`, "y".repeat(40), "w".repeat(40)]).add(cur);
    const { html } = page(cur, long);
    expect(buildSelector(t, world(html))?.length ?? 0).toBeLessThanOrEqual(300);
    // `{` and `@` in a class name survive escaping in the browser, but safeSelectors refuses them outright.
    const bad = new N("DIV", "", ["a@b"]);
    expect(buildSelector(bad, world(page(bad).html))).toBeNull();
  });
});
