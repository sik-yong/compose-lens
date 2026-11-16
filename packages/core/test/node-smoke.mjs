// Imports the built package by name in plain Node (no bundler, no TS loader)
// to prove packages/core works outside Vite. Run after `npm run build`.
import assert from "node:assert/strict";
import { LIMITS } from "@compose-lens/core";

assert.equal(LIMITS.maxInputBytes, 1024 * 1024);
console.log("node smoke: ok");
