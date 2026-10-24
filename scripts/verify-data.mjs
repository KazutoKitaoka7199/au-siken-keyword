import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const data = JSON.parse(await readFile("public/data/terms.json", "utf8"));
const inventory = JSON.parse(
  await readFile("data/source-inventory.json", "utf8"),
);
assert.equal(data.version, 1);
assert.equal(data.terms.length, inventory.expectedCount);
assert.equal(data.expectedCount, inventory.expectedCount);
assert.equal(data.sourceEntryCount, inventory.sourceEntryCount);
assert.equal(
  inventory.pages.reduce((sum, page) => sum + page.count, 0),
  inventory.sourceEntryCount,
);
assert.deepEqual(
  [...new Set(inventory.pages.flatMap((page) => page.termIds))].sort(),
  [...inventory.termIds].sort(),
  "Page entries differ from inventory",
);
for (const page of inventory.pages)
  assert.equal(page.termIds.length, page.count);
const ids = new Set(data.terms.map((term) => term.id));
assert.equal(ids.size, data.terms.length, "Duplicate term identifiers");
assert.deepEqual(
  [...ids].sort(),
  [...inventory.termIds].sort(),
  "Source term coverage differs",
);
const categories = new Set(data.categories.map((category) => category.id));
for (const term of data.terms) {
  for (const field of ["id", "name", "reading", "definition", "sourceUrl"])
    assert.ok(
      typeof term[field] === "string" && term[field].length > 0,
      `${term.id}: missing ${field}`,
    );
  assert.ok(
    term.categoryIds.length &&
      term.categoryIds.every((id) => categories.has(id)),
    `${term.name}: invalid category`,
  );
  assert.ok(Array.isArray(term.aliases) && Array.isArray(term.subcategories));
  assert.equal(new URL(term.sourceUrl).hostname, "www.ap-siken.com");
}
console.log(
  `PASS: ${ids.size} terms, ${categories.size} categories; all source IDs covered, definitions and references present.`,
);
