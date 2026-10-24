export const formats = [
  "choice",
  "truefalse",
  "input",
  "cloze",
  "matching",
] as const;
export type Format = (typeof formats)[number];
export const formatNames: Record<Format, string> = {
  choice: "四択",
  truefalse: "○×",
  input: "用語入力",
  cloze: "穴埋め",
  matching: "組み合わせ",
};
export interface Category {
  id: string;
  name: string;
}
export interface Term {
  id: string;
  name: string;
  reading: string;
  aliases: string[];
  categoryIds: string[];
  subcategories: string[];
  definition: string;
  sourceUrl: string;
}
export interface Dataset {
  version: number;
  sourceUrl: string;
  sourceTitle: string;
  fetchedAt: string;
  expectedCount: number;
  sourceEntryCount: number;
  categories: Category[];
  terms: Term[];
  attribution: string;
}
export interface Settings {
  categoryIds: string[];
  formats: Format[];
  weakOnly: boolean;
}
export interface TermStat {
  attempts: number;
  correct: number;
  streak: number;
  lastSeen: string;
}
export interface AnswerRecord {
  id: string;
  at: string;
  format: Format;
  correct: boolean;
  results: { termId: string; correct: boolean }[];
}
export interface StudyState {
  version: 1;
  stats: Record<string, TermStat>;
  history: AnswerRecord[];
  settings: Settings;
}
export interface Question {
  id: string;
  format: Format;
  term: Term;
  prompt: string;
  text: string;
  options: { id: string; text: string }[];
  correctOption: string;
  pairs: Term[];
  targets: Term[];
}
export type Answer = string | Record<string, string>;
export interface Grade {
  correct: boolean;
  results: { termId: string; correct: boolean }[];
}
