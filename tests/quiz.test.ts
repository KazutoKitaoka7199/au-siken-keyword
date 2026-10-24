import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  acceptsAnswer,
  filteredTerms,
  gradeAnswer,
  isWeak,
  makeQuestion,
  maskTerm,
  normalizeAnswer,
  selectTerm,
  weight,
} from "../src/lib/quiz.ts";
import { formats } from "../src/lib/types.ts";
import type { Dataset, Term } from "../src/lib/types.ts";
import { defaultSettings } from "../src/lib/storage.ts";

const data: Dataset = JSON.parse(
  readFileSync(new URL("../public/data/terms.json", import.meta.url), "utf8"),
);
const tcp = data.terms.find((term) => term.name === "TCP")!;
const stat = {
  attempts: 4,
  correct: 1,
  streak: 0,
  lastSeen: "2026-10-24T00:00:00Z",
};
const rng = () => 0.37;

test("registered names and aliases accept only agreed normalization, not typos or partial answers", () => {
  assert.equal(normalizeAnswer("　ＴＣＰ　"), "tcp");
  assert.ok(acceptsAnswer(tcp, "　ｔＣｐ　"));
  for (const alias of tcp.aliases)
    assert.ok(acceptsAnswer(tcp, alias.toUpperCase()));
  assert.ok(!acceptsAnswer(tcp, "TCPP"));
  assert.ok(!acceptsAnswer(tcp, "TC"));
  assert.ok(!acceptsAnswer(tcp, "T C P"));
  assert.ok(!acceptsAnswer(tcp, ""));
});
test("all source terms and registered aliases can be graded without errors", () => {
  for (const term of data.terms) {
    assert.ok(acceptsAnswer(term, term.name), term.name);
    for (const alias of term.aliases)
      assert.ok(acceptsAnswer(term, alias), term.name);
    assert.equal(typeof maskTerm(term.definition, term), "string");
  }
});
test("five forms grade correct and incorrect answers; matching grades individual terms", () => {
  for (const format of formats) {
    const q = makeQuestion(format, tcp, data.terms, rng);
    const answer =
      format === "input"
        ? tcp.name
        : format === "matching"
          ? Object.fromEntries(q.targets.map((term) => [term.id, term.id]))
          : q.correctOption;
    assert.ok(gradeAnswer(q, answer).correct, format);
    assert.ok(
      !gradeAnswer(q, format === "matching" ? {} : "incorrect").correct,
      format,
    );
    if (format === "choice" || format === "cloze") {
      assert.equal(q.options.length, 4);
      assert.equal(
        new Set(q.options.map((option) => normalizeAnswer(option.text))).size,
        4,
      );
      assert.equal(
        q.options.filter((option) => option.id === tcp.id).length,
        1,
      );
    }
    if (format === "matching") {
      const [a, b, c] = q.targets;
      const result = gradeAnswer(q, {
        [a.id]: b.id,
        [b.id]: a.id,
        [c.id]: c.id,
      });
      assert.equal(result.results.filter((item) => item.correct).length, 1);
      assert.deepEqual(
        result.results.find((item) => item.termId === c.id),
        { termId: c.id, correct: true },
      );
    }
  }
});
test("true/false creates both true and false questions against the source definitions", () => {
  assert.equal(
    makeQuestion("truefalse", tcp, data.terms, () => 0).correctOption,
    "false",
  );
  assert.equal(
    makeQuestion("truefalse", tcp, data.terms, () => 0.999).correctOption,
    "true",
  );
});
test("question generation stays inside selected fields while weak mode selects weak targets", () => {
  const settings = { ...defaultSettings(), categoryIds: [tcp.categoryIds[0]] };
  const filtered = filteredTerms(data.terms, settings, {});
  assert.ok(filtered.length > 3 && filtered.length < data.terms.length);
  assert.ok(
    filtered.every((term) => term.categoryIds.includes(tcp.categoryIds[0])),
  );
  assert.deepEqual(
    filteredTerms(
      data.terms,
      { ...settings, weakOnly: true },
      { [tcp.id]: stat },
    ).map((term) => term.id),
    [tcp.id],
  );
  assert.deepEqual(
    filteredTerms(data.terms, { ...settings, weakOnly: true }, {}),
    [],
  );
});
test("weak terms receive higher weight; recent terms do not immediately repeat", () => {
  assert.ok(isWeak(stat));
  const mastered = { ...stat, correct: 4, streak: 4 };
  assert.ok(!isWeak(mastered));
  assert.ok(weight(stat) > weight() && weight() > weight(mastered));
  const pool = data.terms.slice(0, 4);
  assert.equal(
    selectTerm(
      pool,
      {},
      pool.slice(0, 3).map((term) => term.id),
      () => 0,
    )?.id,
    pool[3].id,
  );
  assert.equal(selectTerm([], {}, [], rng), null);
  assert.equal(selectTerm([tcp], {}, [tcp.id], rng)?.id, tcp.id);
});
test("similar names and equal descriptions are excluded from distractors", () => {
  const clone = { ...tcp, id: "clone", name: "tcp" };
  const duplicate = { ...tcp, id: "duplicate", name: "duplicate name" };
  const q = makeQuestion("choice", tcp, [clone, duplicate, ...data.terms], rng);
  assert.ok(
    !q.options.some(
      (option) => option.id === "clone" || option.id === "duplicate",
    ),
  );
});
