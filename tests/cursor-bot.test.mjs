import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync("src/App.tsx", "utf8");
const cssSource = readFileSync("src/App.css", "utf8");

for (const expected of [
  "function CursorMintBot()",
  "<CursorMintBot />",
  "pointermove",
  "matchMedia('(pointer: coarse)')",
  "prefers-reduced-motion: reduce",
]) {
  assert.match(appSource + cssSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const expected of [
  ".cursor-mint-bot",
  ".cursor-mint-bot__body",
  ".cursor-mint-bot__shadow",
  "@media (pointer: coarse)",
]) {
  assert.match(cssSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
