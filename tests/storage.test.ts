import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  parseState,
  recordAnswer,
  saveState,
} from "../src/lib/storage.ts";
import type { AnswerRecord } from "../src/lib/types.ts";

const record: AnswerRecord = {
  id: "q1",
  at: "2026-10-24T03:00:00Z",
  format: "matching",
  correct: false,
  results: [
    { termId: "a", correct: true },
    { termId: "b", correct: false },
  ],
};
test("individual matching results and question history survive a round trip", () => {
  const old = emptyState();
  const state = recordAnswer(old, record);
  assert.deepEqual(state.stats.a, {
    attempts: 1,
    correct: 1,
    streak: 1,
    lastSeen: record.at,
  });
  assert.deepEqual(state.stats.b, {
    attempts: 1,
    correct: 0,
    streak: 0,
    lastSeen: record.at,
  });
  assert.equal(state.history.length, 1);
  assert.equal(Object.keys(old.stats).length, 0);
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  assert.equal(recordAnswer(state, record), state);
});
test("correct streak resets only for an incorrect answer to that term", () => {
  let state = emptyState();
  for (let i = 0; i < 3; i++)
    state = recordAnswer(state, {
      ...record,
      id: String(i),
      correct: true,
      results: [{ termId: "a", correct: true }],
    });
  state = recordAnswer(state, {
    ...record,
    id: "wrong",
    results: [{ termId: "a", correct: false }],
  });
  assert.equal(state.stats.a.correct, 3);
  assert.equal(state.stats.a.attempts, 4);
  assert.equal(state.stats.a.streak, 0);
});
test("missing storage is fresh; malformed or incompatible records are rejected", () => {
  assert.deepEqual(parseState(null), emptyState());
  assert.throws(() => parseState("broken"));
  assert.throws(() =>
    parseState(JSON.stringify({ ...emptyState(), version: 2 })),
  );
  assert.throws(() =>
    parseState(
      JSON.stringify({
        ...emptyState(),
        settings: { ...emptyState().settings, formats: [] },
      }),
    ),
  );
  assert.throws(() =>
    parseState(
      JSON.stringify({
        ...emptyState(),
        stats: { a: { attempts: 0, correct: 1 } },
      }),
    ),
  );
  assert.throws(() =>
    parseState(
      JSON.stringify({
        ...emptyState(),
        history: [{ ...record, format: "unknown" }],
      }),
    ),
  );
});
test("quota failures return a user-facing warning instead of reporting a successful save", () => {
  let written = "";
  assert.equal(
    saveState(emptyState(), {
      setItem: (_key, value) => {
        written = value;
      },
    }),
    null,
  );
  assert.deepEqual(JSON.parse(written), emptyState());
  assert.match(
    saveState(emptyState(), {
      setItem: () => {
        throw new Error("quota");
      },
    }) ?? "",
    /保存できません/,
  );
});
