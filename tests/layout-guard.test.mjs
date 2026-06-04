import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/App.css", "utf8");

const assertCssContains = (selector, declaration) => {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `${selector} should exist`);
  const end = css.indexOf("}", start);
  const block = css.slice(start, end);
  assert.match(block, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
};

assertCssContains(".hero-section", "align-items: start");
assertCssContains(".product-stage", "align-self: start");
assertCssContains(".converter-card", "max-height: min(760px, calc(100svh - 150px))");
assertCssContains(".converter-card", "overflow-y: auto");
assertCssContains(".converter-card", "overscroll-behavior: contain");
