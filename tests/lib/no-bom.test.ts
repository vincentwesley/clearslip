import { execFileSync } from "node:child_process";
import { openSync, readSync, closeSync } from "node:fs";
import { expect, it } from "vitest";

it("no tracked text file starts with a UTF-8 BOM", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((f) => /\.(json|ts|mjs|html|css|md)$/.test(f));
  const bad = files.filter((f) => {
    const fd = openSync(f, "r");
    try {
      const b = Buffer.alloc(3);
      readSync(fd, b, 0, 3, 0);
      return b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
    } finally {
      closeSync(fd);
    }
  });
  expect(bad).toEqual([]);
});
