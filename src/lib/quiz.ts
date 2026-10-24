import type {
  Answer,
  Format,
  Grade,
  Question,
  Settings,
  StudyState,
  Term,
  TermStat,
} from "./types.ts";

export const normalizeAnswer = (text: string) =>
  text.normalize("NFKC").trim().toLocaleLowerCase("en");
export const acceptsAnswer = (term: Term, text: string) =>
  [term.name, ...term.aliases].some(
    (name) => normalizeAnswer(name) === normalizeAnswer(text),
  );
export const isWeak = (stat?: TermStat) =>
  !!stat && (stat.correct / stat.attempts < 0.7 || stat.streak === 0);
export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function filteredTerms(
  terms: Term[],
  settings: Settings,
  stats: StudyState["stats"],
) {
  return terms.filter(
    (term) =>
      (!settings.categoryIds.length ||
        term.categoryIds.some((id) => settings.categoryIds.includes(id))) &&
      (!settings.weakOnly || isWeak(stats[term.id])),
  );
}
export function weight(stat?: TermStat) {
  if (!stat) return 2;
  return (
    1 + (1 - stat.correct / stat.attempts) * 5 + (stat.streak === 0 ? 2 : 0)
  );
}
export function selectTerm(
  terms: Term[],
  stats: StudyState["stats"],
  previous: string[],
  random = Math.random,
): Term | null {
  const fresh = terms.filter((term) => !previous.includes(term.id));
  const pool = fresh.length ? fresh : terms;
  if (!pool.length) return null;
  const total = pool.reduce((sum, term) => sum + weight(stats[term.id]), 0);
  let cursor = random() * total;
  for (const term of pool) {
    cursor -= weight(stats[term.id]);
    if (cursor < 0) return term;
  }
  return pool[pool.length - 1];
}
export function maskTerm(text: string, term: Term) {
  let result = text;
  for (const name of [term.name, ...term.aliases]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = /^[a-z0-9]+$/i.test(name)
      ? `(?<![a-z0-9])${escaped}(?![a-z0-9])`
      : escaped;
    result = result.replace(new RegExp(pattern, "gi"), "［　］");
  }
  return result;
}
function distinctCandidates(term: Term, pool: Term[], random: () => number) {
  const seen = new Set([
    normalizeAnswer(term.name),
    normalizeAnswer(term.definition),
  ]);
  const candidates = pool.filter(
    (item) =>
      item.id !== term.id &&
      !acceptsAnswer(term, item.name) &&
      !acceptsAnswer(item, term.name),
  );
  const close = candidates.filter((item) =>
    item.categoryIds.some((id) => term.categoryIds.includes(id)),
  );
  const closeIds = new Set(close.map((item) => item.id));
  const far = candidates.filter((item) => !closeIds.has(item.id));
  return [...shuffle(close, random), ...shuffle(far, random)].filter((item) => {
    const name = normalizeAnswer(item.name),
      definition = normalizeAnswer(item.definition);
    if (seen.has(name) || seen.has(definition)) return false;
    seen.add(name);
    seen.add(definition);
    return true;
  });
}
export function makeQuestion(
  format: Format,
  term: Term,
  pool: Term[],
  random = Math.random,
): Question {
  const other = distinctCandidates(term, pool, random);
  const q: Question = {
    id: crypto.randomUUID(),
    format,
    term,
    prompt: "",
    text: "",
    options: [],
    correctOption: term.id,
    pairs: [],
    targets: [],
  };
  const clue = maskTerm(term.definition, term);
  if (format === "choice") {
    q.prompt = "この説明に当てはまる用語は？";
    q.text = clue;
    q.options = shuffle([term, ...other.slice(0, 3)], random).map((item) => ({
      id: item.id,
      text: item.name,
    }));
  } else if (format === "input") {
    q.prompt = "説明を読んで、用語を入力してください";
    q.text = clue;
  } else if (format === "cloze") {
    q.prompt = "空欄に入る用語を選んでください";
    q.text = `「（　）」とは、${clue.replace(/^[\s、。]+/, "")}`;
    q.options = shuffle([term, ...other.slice(0, 3)], random).map((item) => ({
      id: item.id,
      text: item.name,
    }));
  } else if (format === "truefalse") {
    const truth = !other.length || random() >= 0.5;
    q.prompt = "用語と説明の組み合わせは正しい？";
    q.text = `${term.name}\n${truth ? term.definition : other[0].definition}`;
    q.options = [
      { id: "true", text: "○ 正しい" },
      { id: "false", text: "× 誤り" },
    ];
    q.correctOption = truth ? "true" : "false";
  } else {
    q.prompt = "用語を、対応する説明へドラッグ";
    q.text = "用語と説明を正しく組み合わせましょう。";
    q.pairs = shuffle([term, ...other.slice(0, 2)], random);
    q.targets = shuffle(q.pairs, random);
  }
  return q;
}
export function gradeAnswer(question: Question, answer: Answer): Grade {
  let results: Grade["results"];
  if (question.format === "matching") {
    const matches = typeof answer === "object" ? answer : {};
    results = question.targets.map((term) => ({
      termId: term.id,
      correct: matches[term.id] === term.id,
    }));
  } else {
    const correct =
      typeof answer === "string" &&
      (question.format === "input"
        ? acceptsAnswer(question.term, answer)
        : answer === question.correctOption);
    results = [{ termId: question.term.id, correct }];
  }
  return { correct: results.every((result) => result.correct), results };
}
