// Element picker. Injected into the top frame of one tab by the service worker, only after an explicit click
// on "Hide something on this page". It touches the page's DOM only through one host element with a closed
// shadow root, and sends exactly one message ({ type: "zap", selector }) when the user presses Hide.
import { buildSelector, type Ctx, type El } from "./lib/selector";

const FLAG = "__hushPicker";
const g = globalThis as unknown as Record<string, unknown>;

if (!g[FLAG]) {
  g[FLAG] = true;
  const doc = document;
  const host = doc.createElement("div");
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none";
  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet(); // constructed, so a page CSP that blocks inline <style> cannot break it
  sheet.replaceSync(`
    *{box-sizing:border-box}
    .box{position:fixed;display:none;pointer-events:none;outline:2px solid #4fe0a0;outline-offset:-1px;background:rgba(79,224,160,.18);box-shadow:0 0 0 1px #11150e}
    .bar{position:fixed;right:12px;bottom:12px;max-width:min(420px,calc(100vw - 24px));display:grid;gap:8px;padding:12px;pointer-events:auto;
      background:#1a2015;color:#e9f0df;font:14px/1.4 system-ui,sans-serif;box-shadow:0 -2px #6f8560,0 2px #6f8560,-2px 0 #6f8560,2px 0 #6f8560,4px 4px 0 2px #e9a07f}
    .msg{margin:0}.sel{margin:0;font:12px/1.4 ui-monospace,Consolas,monospace;overflow-wrap:anywhere;color:#aebb9f}
    .row{display:flex;gap:8px;flex-wrap:wrap}
    button{min-width:48px;min-height:48px;padding:0 16px;font:600 14px system-ui,sans-serif;border:2px solid #4fe0a0;border-radius:0;cursor:pointer;background:#4fe0a0;color:#04140b}
    button.ghost{background:transparent;color:#e9f0df}
    button:disabled{opacity:.5;cursor:default}
    button:focus-visible{outline:2px solid #7db4ff;outline-offset:2px}`);
  shadow.adoptedStyleSheets = [sheet];

  const el = (tag: string, cls?: string, text?: string): HTMLElement => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const box = el("div", "box");
  const bar = el("div", "bar");
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Hush: hide something");
  const msg = el("p", "msg", "Click what you want to hide. Esc cancels.");
  msg.setAttribute("role", "status");
  const selText = el("p", "sel");
  const buttons = el("div", "row");
  const hideBtn = el("button", undefined, "Hide") as HTMLButtonElement;
  const cancelBtn = el("button", "ghost", "Cancel") as HTMLButtonElement;
  hideBtn.type = cancelBtn.type = "button";
  hideBtn.disabled = true;
  buttons.append(hideBtn, cancelBtn);
  bar.append(msg, selText, buttons);
  shadow.append(box, bar);
  doc.documentElement.append(host);

  const ctx: Ctx = {
    query: (s) => {
      try {
        return [...doc.querySelectorAll(s)] as unknown as El[];
      } catch {
        return [];
      }
    },
    escape: (s) => CSS.escape(s),
  };
  const usable = (e: Element | null): e is HTMLElement => !!e && e !== doc.documentElement && e !== doc.body && !host.contains(e) && e !== host;
  const fromEvent = (e: Event): Element | null => (e.composedPath().includes(host) ? null : (e.target as Element | null));

  let hover: Element | null = null;
  let chosen: Element | null = null;
  const narrower: Element[] = []; // where ArrowDown goes back to
  let selector: string | null = null;
  let busy = false;

  const outline = (e: Element | null): void => {
    if (!e || !usable(e)) return void (box.style.display = "none");
    const r = e.getBoundingClientRect();
    Object.assign(box.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  };
  const refresh = (): void => {
    outline(chosen ?? hover);
    if (!chosen) return;
    selector = buildSelector(chosen as unknown as El, ctx);
    hideBtn.disabled = busy || !selector;
    if (selector) {
      const n = ctx.query(selector).length;
      msg.textContent = `Matches ${n} element${n === 1 ? "" : "s"}. Up and Down arrows change the size.`;
      selText.textContent = selector;
    } else {
      msg.textContent = "Cannot build a safe rule for this element. Try the Up arrow key.";
      selText.textContent = "";
    }
  };

  const listeners: [string, (e: never) => void, AddEventListenerOptions][] = [];
  const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts: AddEventListenerOptions = { capture: true }): void => {
    window.addEventListener(type, fn, opts);
    listeners.push([type, fn as (e: never) => void, opts]);
  };
  const stop = (e: Event): void => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const cleanup = (): void => {
    for (const [t, fn, o] of listeners) window.removeEventListener(t, fn as EventListener, o);
    host.remove();
    delete g[FLAG];
  };

  on("pointermove", (e) => {
    if (chosen) return;
    const t = fromEvent(e);
    hover = usable(t) ? t : null;
    outline(hover);
  });
  // The page must not see the pick: swallow the whole press sequence, not just click.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "auxclick", "dblclick", "contextmenu"] as const)
    on(type, (e) => {
      if (fromEvent(e)) stop(e);
    });
  on("click", (e) => {
    const t = fromEvent(e);
    if (!t) return; // the toolbar's own buttons
    stop(e);
    if (chosen || !usable(t)) return;
    chosen = t;
    narrower.length = 0;
    refresh();
    hideBtn.focus();
  });
  on("keydown", (e) => {
    if (e.key === "Escape") {
      stop(e);
      cleanup();
    } else if (chosen && e.key === "ArrowUp") {
      stop(e);
      if (usable(chosen.parentElement)) {
        narrower.push(chosen);
        chosen = chosen.parentElement;
        refresh();
      }
    } else if (chosen && e.key === "ArrowDown") {
      stop(e);
      chosen = narrower.pop() ?? chosen;
      refresh();
    }
  });
  on("scroll", () => outline(chosen ?? hover), { capture: true, passive: true });
  on("resize", () => outline(chosen ?? hover), { passive: true });

  cancelBtn.addEventListener("click", cleanup);
  hideBtn.addEventListener("click", () => {
    if (!selector || busy) return;
    busy = true;
    hideBtn.disabled = true;
    const reasons: Record<string, string> = {
      "limit-selectors": "Too many hidden items on this site (limit 100). Show some again in the side panel first.",
      "limit-hosts": "Too many sites have hidden items (limit 500).",
      unsupported: "Hush is paused on this site. Turn it on to hide items.",
    };
    chrome.runtime.sendMessage({ type: "zap", selector }).then(
      (res: { ok?: boolean; reason?: string } | undefined) => {
        if (res?.ok) return cleanup();
        busy = false;
        refresh();
        msg.textContent = (res?.reason && reasons[res.reason]) || "Could not save this rule.";
      },
      () => {
        busy = false;
        hideBtn.disabled = false;
        msg.textContent = "Could not reach Hush. Reload the page and try again.";
      },
    );
  });
}
