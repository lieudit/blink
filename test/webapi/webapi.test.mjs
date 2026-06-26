import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import createBlink from "../../o/emscripten/blink.mjs";
import { ENTRY, divideByZero, exitWith, illegal } from "./guest.mjs";

const OK = 0,
  EXITED = 1,
  TRAPPED = 2,
  NO_PROGRAM = -1;

let M, api;

before(async () => {
  M = await createBlink();
  api = {
    init: M.cwrap("blink_init", "number", []),
    load: M.cwrap("blink_load", "number", ["string"]),
    step: M.cwrap("blink_step", "number", []),
    cont: M.cwrap("blink_continue", "number", ["number"]),
    reset: M.cwrap("blink_reset", null, []),
    machine: M.cwrap("blink_machine", "number", []),
    pc: M.cwrap("blink_pc", "number", []),
    status: M.cwrap("blink_status", "number", []),
    exitCode: M.cwrap("blink_exit_code", "number", []),
    signal: M.cwrap("blink_signal", "number", []),
  };
  assert.equal(api.init(), 0);
});

function load(bytes) {
  M.FS.writeFile("/guest", bytes, { mode: 0o755 });
  return api.load("/guest");
}

function runToEnd(max = 100000) {
  let n = 0;
  while (api.step() === OK && ++n < max);
  return n;
}

describe("lifecycle", () => {
  test("init is idempotent", () => {
    assert.equal(api.init(), 0);
  });

  test("step before load reports no program", () => {
    api.reset();
    assert.equal(api.step(), NO_PROGRAM);
    assert.equal(api.status(), NO_PROGRAM);
    assert.equal(api.machine(), 0);
  });

  test("loading a missing path reports no program", () => {
    assert.equal(api.load("/does-not-exist"), NO_PROGRAM);
  });

  test("reset tears down the machine", () => {
    assert.equal(load(exitWith(0)), 0);
    assert.notEqual(api.machine(), 0);
    api.reset();
    assert.equal(api.machine(), 0);
    assert.equal(api.status(), NO_PROGRAM);
  });
});

describe("clean exit", () => {
  test("exit(42) reports exited with the right code and no signal", () => {
    assert.equal(load(exitWith(42)), 0);
    api.cont(0);
    assert.equal(api.status(), EXITED);
    assert.equal(api.exitCode(), 42);
    assert.equal(api.signal(), 0);
  });

  test("exit(0) reports exit code 0", () => {
    assert.equal(load(exitWith(0)), 0);
    runToEnd();
    assert.equal(api.status(), EXITED);
    assert.equal(api.exitCode(), 0);
  });

  test("continue counts only OK steps, not the exiting one", () => {
    assert.equal(load(exitWith(7)), 0);
    const n = api.cont(0);
    assert.equal(n, 2);
    assert.equal(api.status(), EXITED);
  });
});

describe("faults map to terminating signals", () => {
  test("illegal instruction -> SIGILL (4)", () => {
    assert.equal(load(illegal()), 0);
    runToEnd();
    assert.equal(api.status(), TRAPPED);
    assert.equal(api.signal(), 4);
    assert.equal(api.exitCode(), 128 + 4);
  });

  test("divide by zero -> SIGFPE (8)", () => {
    assert.equal(load(divideByZero()), 0);
    runToEnd();
    assert.equal(api.status(), TRAPPED);
    assert.equal(api.signal(), 8);
    assert.equal(api.exitCode(), 128 + 8);
  });

  test("signal is cleared when a fresh program is loaded", () => {
    assert.equal(load(illegal()), 0);
    runToEnd();
    assert.equal(api.signal(), 4);
    assert.equal(load(exitWith(0)), 0); // reload must reset state
    assert.equal(api.signal(), 0);
    assert.equal(api.status(), OK);
  });
});

describe("introspection", () => {
  test("pc starts at the entry point and advances per step", () => {
    assert.equal(load(exitWith(42)), 0);
    assert.equal(api.pc(), ENTRY);
    assert.equal(api.step(), OK);
    assert.equal(api.pc(), ENTRY + 5); // mov edi,imm32 is 5 bytes
  });

  test("disasm renders the instruction at an address", () => {
    assert.equal(load(exitWith(42)), 0);
    const cap = 256;
    const out = M._malloc(cap);
    try {
      const disasm = M.cwrap("blink_disasm", "number", [
        "number",
        "number",
        "number",
        "number",
      ]);
      const n = disasm(ENTRY, 1, out, cap);
      assert.ok(n > 0);
      const line = M.UTF8ToString(out);
      assert.match(line, /mov/);
    } finally {
      M._free(out);
    }
  });
});
