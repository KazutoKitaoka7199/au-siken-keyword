import { formats } from "./types.ts";
import type { AnswerRecord, Settings, StudyState, TermStat } from "./types.ts";

export const STORAGE_KEY = "ap-keyword-study:v1";
export const defaultSettings = (): Settings => ({
  categoryIds: [],
  formats: [...formats],
  weakOnly: false,
});
export const emptyState = (): StudyState => ({
  version: 1,
  stats: {},
  history: [],
  settings: defaultSettings(),
});
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const safeDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
function validStat(value: unknown): value is TermStat {
  return (
    object(value) &&
    integer(value.attempts) &&
    value.attempts > 0 &&
    integer(value.correct) &&
    value.correct <= value.attempts &&
    integer(value.streak) &&
    value.streak <= value.correct &&
    safeDate(value.lastSeen)
  );
}
export function validRecord(value: unknown): value is AnswerRecord {
  return (
    object(value) &&
    typeof value.id === "string" &&
    safeDate(value.at) &&
    formats.includes(value.format as (typeof formats)[number]) &&
    typeof value.correct === "boolean" &&
    Array.isArray(value.results) &&
    value.results.length > 0 &&
    value.results.every(
      (result) =>
        object(result) &&
        typeof result.termId === "string" &&
        typeof result.correct === "boolean",
    )
  );
}
export function parseState(raw: string | null): StudyState {
  if (!raw) return emptyState();
  const data: unknown = JSON.parse(raw);
  if (
    !object(data) ||
    data.version !== 1 ||
    !object(data.stats) ||
    !Array.isArray(data.history) ||
    !object(data.settings)
  )
    throw new Error("学習記録の形式が読み取れませんでした。");
  if (
    !Object.values(data.stats).every(validStat) ||
    !data.history.every(validRecord)
  )
    throw new Error("学習記録の一部が壊れています。");
  const settings = data.settings;
  if (
    !Array.isArray(settings.categoryIds) ||
    !settings.categoryIds.every((id) => typeof id === "string") ||
    !Array.isArray(settings.formats) ||
    !settings.formats.length ||
    !settings.formats.every((f) =>
      formats.includes(f as (typeof formats)[number]),
    ) ||
    typeof settings.weakOnly !== "boolean"
  )
    throw new Error("学習設定を読み取れませんでした。");
  return data as unknown as StudyState;
}
export function recordAnswer(
  state: StudyState,
  record: AnswerRecord,
): StudyState {
  if (state.history.some((item) => item.id === record.id)) return state;
  const stats = { ...state.stats };
  for (const result of record.results) {
    const old = stats[result.termId] ?? {
      attempts: 0,
      correct: 0,
      streak: 0,
      lastSeen: "",
    };
    stats[result.termId] = {
      attempts: old.attempts + 1,
      correct: old.correct + Number(result.correct),
      streak: result.correct ? old.streak + 1 : 0,
      lastSeen: record.at,
    };
  }
  return { ...state, stats, history: [record, ...state.history] };
}
export function saveState(
  state: StudyState,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch {
    return "学習記録を保存できませんでした。ブラウザの保存容量や設定を確認してください。この画面を閉じると今回の記録が失われる可能性があります。";
  }
}
