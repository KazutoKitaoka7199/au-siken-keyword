import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { emptyState, recordAnswer, STORAGE_KEY } from "../src/lib/storage.ts";
import { formats } from "../src/lib/types.ts";
import type { Dataset, Format } from "../src/lib/types.ts";

const data: Dataset = JSON.parse(
  readFileSync(new URL("../public/data/terms.json", import.meta.url), "utf8"),
);
const tcp = data.terms.find((term) => term.name === "TCP")!;
async function seed(page: Page, format: Format) {
  const state = recordAnswer(emptyState(), {
    id: "earlier",
    at: new Date().toISOString(),
    format,
    correct: false,
    results: [{ termId: tcp.id, correct: false }],
  });
  state.settings = { categoryIds: [], formats: [format], weakOnly: true };
  await page.addInitScript(
    ({ state, key }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { state, key: STORAGE_KEY },
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "学習する", exact: true })
    .click();
  await page.getByRole("button", { name: "この設定で学習する" }).click();
  await expect(page.locator(".question-format")).toBeVisible();
}
async function drag(page: Page, termId: string, mobile: boolean) {
  const target = page.locator(`[data-drop="${termId}"]`).first();
  await target.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  const source = page.locator(`[data-drag="${termId}"]`);
  const a = (await source.boundingBox())!,
    b = (await target.boundingBox())!;
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const end = { x: b.x + b.width / 2, y: b.y + b.height - 25 };
  if (mobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...start, id: 1 }],
    });
    for (let i = 1; i <= 12; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * i) / 12,
            y: start.y + ((end.y - start.y) * i) / 12,
            id: 1,
          },
        ],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 14 });
    await page.mouse.up();
  }
  await expect(target.locator(".drop-slot")).not.toHaveText(
    "ここに用語をドロップ",
  );
}

test("home shows the complete glossary; searching and revealing a source definition works", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今日も、一語ずつ。" }),
  ).toBeVisible();
  await expect(page.locator(".coverage>strong")).toContainText("4,921");
  await page.screenshot({
    path: `test-results/home-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "用語を探す" })
    .click();
  await page.getByRole("searchbox").fill("　ＴＣＰ　");
  const row = page
    .locator(".term-row")
    .filter({ has: page.getByText("TCP", { exact: true }) });
  await row.locator("summary").click();
  await expect(row.locator(".term-detail")).toContainText(tcp.definition);
  await expect(row.getByRole("link")).toHaveAttribute("href", tcp.sourceUrl);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

for (const format of formats)
  test(`${format}: answering, explanations, next question and persisted history`, async ({
    page,
  }, info) => {
    await seed(page, format);
    await expect(
      page.getByRole("button", { name: "回答する", exact: true }),
    ).toBeDisabled();
    if (format === "input")
      await page
        .getByRole("textbox", { name: "用語を入力" })
        .fill("　ｔＣＰ　");
    else if (format === "matching") {
      const ids = await page
        .locator(".match-target")
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLElement).dataset.drop!),
        );
      for (const id of ids)
        await drag(page, id, info.project.name === "mobile");
    } else if (format === "truefalse") {
      const description = await page
        .locator(".question-text>span")
        .textContent();
      await page
        .getByRole("radio", {
          name: description === tcp.definition ? "○ 正しい" : "× 誤り",
          exact: true,
        })
        .click();
    } else
      await page
        .getByRole("radio")
        .filter({ has: page.getByText(tcp.name, { exact: true }) })
        .click();
    await page.getByRole("button", { name: "回答する", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "正解です！" }),
    ).toBeVisible();
    await expect(
      page.locator(".explanation").filter({ hasText: tcp.definition }),
    ).toContainText(tcp.name);
    const history = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).history,
      STORAGE_KEY,
    );
    expect(history).toHaveLength(2);
    expect(history[0].format).toBe(format);
    expect(history[0].correct).toBe(true);
    await page.getByRole("button", { name: "次の問題へ" }).click();
    await expect(page.locator(".question-card")).toBeVisible();
    await page.reload();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "学習記録" })
      .click();
    await expect(page.locator(".history-row")).toHaveCount(2);
  });

test("wrong answers are recorded; source/category filters and weak-only study remain enabled", async ({
  page,
}) => {
  await seed(page, "input");
  await page.getByRole("textbox", { name: "用語を入力" }).fill("wrong answer");
  await page.getByRole("button", { name: "回答する", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ここで覚えて、次の一歩に。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ここでひと休み" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "学習する", exact: true })
    .click();
  await expect(page.getByRole("switch")).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "用語入力", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "用語入力", exact: true })
    .click({ force: true });
  await expect(
    page.getByRole("checkbox", { name: "用語入力", exact: true }),
  ).toBeChecked();
});

test("corrupt saved data is preserved and a load failure can be retried", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "{broken"),
    STORAGE_KEY,
  );
  let fail = true;
  await page.route("**/data/terms.json", (route) =>
    fail
      ? route.fulfill({ status: 503, body: "unavailable" })
      : route.continue(),
  );
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "元の記録を残すため" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "用語を読み込めませんでした" }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "もう一度読み込む" }).click();
  await expect(
    page.getByRole("heading", { name: "今日も、一語ずつ。" }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe("{broken");
});
