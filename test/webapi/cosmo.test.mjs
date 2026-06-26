import assert from "node:assert/strict";
import fs from "node:fs";
import { before, beforeEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import createBlink from "../../o/emscripten/blink.mjs";
import { entryOf } from "./guest.mjs";

const FIXTURE = fileURLToPath(
  new URL("../../third_party/cosmo/tinyhello.elf", import.meta.url),
);

const ELF = fs.readFileSync(FIXTURE);
const ENTRY = entryOf(ELF);
const OK = 0,
  EXITED = 1;

let M, api, stdout;

before(async () => {
  M = await createBlink({
    print: (s) => stdout.push(s),
    printErr: () => {},
  });
  api = {
    init: M.cwrap("blink_init", "number", []),
    load: M.cwrap("blink_load", "number", ["string"]),
    step: M.cwrap("blink_step", "number", []),
    cont: M.cwrap("blink_continue", "number", ["number"]),
    status: M.cwrap("blink_status", "number", []),
    pc: M.cwrap("blink_pc", "number", []),
    exitCode: M.cwrap("blink_exit_code", "number", []),
    disasm: M.cwrap("blink_disasm", "number", [
      "number",
      "number",
      "number",
      "number",
    ]),
  };
  api.init();
  M.FS.writeFile("/tinyhello.elf", ELF, { mode: 0o755 });
});

beforeEach(() => {
  stdout = [];
});

describe("cosmopolitan tinyhello.elf", () => {
  test("single-steps a real binary to a clean exit, producing its output", () => {
    assert.equal(api.load("/tinyhello.elf"), 0);
    assert.equal(api.pc(), ENTRY);

    let steps = 0;
    let prev = api.pc();
    while (api.step() === OK) {
      const now = api.pc();
      assert.notEqual(now, prev);
      prev = now;
      assert.ok(++steps < 100000, "runaway");
    }

    assert.ok(steps > 1, "expected several discrete steps");
    assert.equal(api.status(), EXITED);
    assert.equal(api.exitCode(), 0);
    assert.match(stdout.join("\n"), /hello world/);
  });

  test("blink_continue agrees with single-stepping", () => {
    assert.equal(api.load("/tinyhello.elf"), 0);
    let single = 0;
    while (api.step() === OK) single++;

    assert.equal(api.load("/tinyhello.elf"), 0);
    const continued = api.cont(0);
    assert.equal(continued, single);
    assert.equal(api.status(), EXITED);
    assert.equal(api.exitCode(), 0);
  });

  test("disasm works on the real binary's entry point", () => {
    assert.equal(api.load("/tinyhello.elf"), 0);
    const cap = 512;
    const out = M._malloc(cap);
    try {
      const n = api.disasm(ENTRY, 4, out, cap);
      assert.ok(n > 0);
      assert.ok(M.UTF8ToString(out).length > 0);
    } finally {
      M._free(out);
    }
  });
});
