import { load } from "cheerio";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const base = "https://www.ap-siken.com";
const cache = ".cache/glossary";
await mkdir(cache, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function page(url) {
  const file = path.join(
    cache,
    createHash("sha256").update(url).digest("hex") + ".html",
  );
  if (!process.argv.includes("--refresh")) {
    try {
      return await readFile(file, "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "au-siken-keyword/0.1 (personal, user-requested glossary import)",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const html = await response.text();
  if (!html.includes('class="main keyword"'))
    throw new Error(`Unexpected source page: ${url}`);
  await writeFile(file, html);
  await pause(300);
  return html;
}
const tidy = (text) => text.replace(/\s+/g, " ").trim();
const rootHtml = await page(base + "/keyword/");
const $ = load(rootHtml);
const totalText = $(".main.keyword")
  .text()
  .match(/全\s*([\d,]+)\s*語/);
if (!totalText)
  throw new Error(
    "Could not read the source glossary total; no data was changed.",
  );
const expectedCount = Number(totalText[1].replaceAll(",", ""));
const categories = $(".cat-card__link")
  .toArray()
  .filter((el) => /^\/keyword\/\d+\/$/.test($(el).attr("href") ?? ""))
  .map((el) => ({
    id: $(el).find(".cat-card__id").text().trim(),
    name: $(el).find(".cat-card__name").text().trim(),
  }));
const subpages = [
  ...new Set(
    $(".sub_category__link")
      .toArray()
      .map((el) => $(el).attr("href"))
      .filter((href) => /^\/keyword\/\d+\/\d+-\d+$/.test(href ?? "")),
  ),
];
if (categories.length !== 23 || subpages.length < 50)
  throw new Error("Source category structure changed.");
const terms = new Map();
const pages = [];
for (const [index, relative] of subpages.entries()) {
  const url = base + relative + "/";
  const html = await page(url);
  const doc = load(html);
  const articles = doc("article.term-article");
  const announced = Number(
    doc(".main.keyword h2")
      .text()
      .match(/-\s*(\d+)語/)?.[1],
  );
  if (!articles.length || articles.length !== announced)
    throw new Error(`Incomplete subcategory: ${url}`);
  pages.push({
    url,
    count: articles.length,
    termIds: articles.toArray().map((article) => doc(article).attr("id")),
    sha256: createHash("sha256").update(html).digest("hex"),
  });
  for (const article of articles.toArray()) {
    const el = doc(article);
    const id = el.attr("id");
    const name = tidy(el.find(".term-article__title").text());
    const body = tidy(el.find('[itemprop="description"]').text());
    const reading = tidy(
      el.find(".term-article__meta li").first().find("span").text(),
    );
    const english = tidy(el.find('[itemprop="alternateName"]').text());
    const tags = el
      .find(".category_badge")
      .toArray()
      .map((a) => ({
        url: new URL(doc(a).attr("href"), base).href,
        label: tidy(doc(a).text()).replace(/^\d+(?:-\d+)?\s*/, ""),
      }));
    const categoryIds = tags
      .filter((tag) => /\/keyword\/\d+\/$/.test(tag.url))
      .map((tag) => tag.url.match(/\/keyword\/(\d+)\/$/)[1]);
    const subcategories = tags
      .filter((tag) => /\/\d+-\d+\/$/.test(tag.url))
      .map((tag) => tag.label);
    // Keep short factual learning cues, not the source's complete extended articles.
    const sentences = body.match(/[^。！？]+[。！？]?/g) ?? [];
    let definition = sentences[0] ?? "";
    if (
      definition.length < 45 &&
      sentences[1] &&
      definition.length + sentences[1].length <= 145
    )
      definition += sentences[1];
    if (!id || !name || !definition || !categoryIds.length)
      throw new Error(`Missing term fields at ${url}`);
    const aliases = english && !/^[-－—なし]+$/.test(english) ? [english] : [];
    const old = terms.get(id);
    if (old) {
      if (old.name !== name) throw new Error(`Conflicting source id: ${id}`);
      old.categoryIds = [...new Set([...old.categoryIds, ...categoryIds])];
      old.subcategories = [
        ...new Set([...old.subcategories, ...subcategories]),
      ];
      old.aliases = [...new Set([...old.aliases, ...aliases])];
    } else
      terms.set(id, {
        id,
        name,
        reading,
        aliases,
        categoryIds,
        subcategories,
        definition,
        sourceUrl: url + "#" + id,
      });
  }
  console.log(
    `${index + 1}/${subpages.length}: ${doc(".main.keyword h2").text()} (${terms.size} unique terms)`,
  );
}
const sourceEntryCount = pages.reduce((sum, page) => sum + page.count, 0);
if (sourceEntryCount !== expectedCount)
  throw new Error(
    `Coverage mismatch: source ${expectedCount}, collected ${sourceEntryCount} entries. Existing data retained.`,
  );
const sorted = [...terms.values()].sort((a, b) =>
  a.name.localeCompare(b.name, "ja"),
);
const data = {
  version: 1,
  sourceUrl: base + "/keyword/",
  sourceTitle: $("title").text().split("｜")[0],
  fetchedAt: new Date().toISOString(),
  expectedCount: sorted.length,
  sourceEntryCount,
  categories,
  terms: sorted,
  attribution:
    "用語・分類・学習用の短い説明の参照元：応用情報技術者試験ドットコム。参照元の説明には生成AIが使用されています。",
};
const inventory = {
  expectedCount: sorted.length,
  sourceEntryCount,
  sourceUrl: data.sourceUrl,
  fetchedAt: data.fetchedAt,
  pages,
  termIds: sorted.map((term) => term.id),
};
await mkdir("public/data", { recursive: true });
await mkdir("data", { recursive: true });
await writeFile("public/data/terms.json.tmp", JSON.stringify(data));
await writeFile(
  "data/source-inventory.json.tmp",
  JSON.stringify(inventory, null, 2) + "\n",
);
await rename("public/data/terms.json.tmp", "public/data/terms.json");
await rename("data/source-inventory.json.tmp", "data/source-inventory.json");
console.log(
  `Saved all ${sourceEntryCount} source entries as ${sorted.length} unique terms across ${categories.length} categories.`,
);
