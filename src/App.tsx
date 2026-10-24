import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock3,
  Flame,
  Home,
  Layers3,
  Lightbulb,
  ListFilter,
  LoaderCircle,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import Matching from "./Matching.tsx";
import {
  acceptsAnswer,
  filteredTerms,
  gradeAnswer,
  isWeak,
  makeQuestion,
  normalizeAnswer,
  selectTerm,
} from "./lib/quiz.ts";
import {
  defaultSettings,
  emptyState,
  parseState,
  recordAnswer,
  saveState,
  STORAGE_KEY,
} from "./lib/storage.ts";
import { formatNames, formats } from "./lib/types.ts";
import type {
  Answer,
  Dataset,
  Format,
  Grade,
  Question,
  Settings,
  StudyState,
  Term,
} from "./lib/types.ts";

type Screen = "home" | "setup" | "quiz" | "glossary" | "stats";
const number = (value: number) => value.toLocaleString("ja-JP");
const accuracy = (state: StudyState) =>
  state.history.length
    ? Math.round(
        (state.history.filter((item) => item.correct).length /
          state.history.length) *
          100,
      )
    : null;
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
function initialState() {
  try {
    return { state: parseState(localStorage.getItem(STORAGE_KEY)), error: "" };
  } catch {
    return {
      state: emptyState(),
      error:
        "保存済みの学習記録を読み取れませんでした。元の記録を残すため、保存を停止しています。「学習記録」から初期化できます。",
    };
  }
}

export default function App() {
  const [initial] = useState(initialState);
  const [study, setStudy] = useState(initial.state);
  const [saveError, setSaveError] = useState(initial.error);
  const [blocked, setBlocked] = useState(!!initial.error);
  const [data, setData] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [screen, setScreen] = useState<Screen>("home");
  const [settings, setSettings] = useState(study.settings);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<Answer>("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [listCategory, setListCategory] = useState("");
  const [visible, setVisible] = useState(40);
  const [weakList, setWeakList] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    fetch(`${import.meta.env.BASE_URL}data/terms.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("用語データを取得できませんでした。");
        const result: Dataset = await response.json();
        if (
          result.version !== 1 ||
          !Array.isArray(result.terms) ||
          !result.terms.length ||
          result.terms.length !== result.expectedCount
        )
          throw new Error("用語データを読み取れませんでした。");
        setData(result);
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setLoadError(
            "用語データを読み込めませんでした。通信状況を確認して再読み込みしてください。",
          );
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (!blocked) setSaveError(saveState(study) ?? "");
  }, [study, blocked]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
  useEffect(() => {
    if (question) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [question]);

  const terms = data?.terms ?? [];
  const termMap = useMemo(
    () => new Map(terms.map((term) => [term.id, term])),
    [terms],
  );
  const weak = useMemo(
    () => terms.filter((term) => isWeak(study.stats[term.id])),
    [terms, study.stats],
  );
  const learned = terms.filter((term) => !!study.stats[term.id]).length;
  const mastered = terms.filter(
    (term) => (study.stats[term.id]?.streak ?? 0) >= 2,
  ).length;
  const today = study.history.filter(
    (item) => dateKey(new Date(item.at)) === dateKey(new Date()),
  );
  const percent = accuracy(study);
  const available = filteredTerms(terms, settings, study.stats);
  const navigate = (next: Screen) => {
    setScreen(next);
    if (next === "glossary") setWeakList(false);
  };
  const updateSettings = (next: Settings) => {
    setSettings(next);
    setStudy((previous) => ({ ...previous, settings: next }));
  };
  const generate = (config: Settings, last: string[]) => {
    const pool = filteredTerms(
      terms,
      { ...config, weakOnly: false },
      study.stats,
    );
    const targets = filteredTerms(terms, config, study.stats);
    const term = selectTerm(targets, study.stats, last);
    setAnswer("");
    setGrade(null);
    if (!term) {
      setQuestion(null);
      return;
    }
    const format =
      config.formats[Math.floor(Math.random() * config.formats.length)];
    setQuestion(makeQuestion(format, term, pool.length >= 4 ? pool : terms));
    setRecent([term.id, ...last].slice(0, 3));
  };
  const start = (config = settings) => {
    updateSettings(config);
    setSessionCount(0);
    setSessionCorrect(0);
    setRecent([]);
    generate(config, []);
    setScreen("quiz");
  };
  const submit = () => {
    if (!question || grade) return;
    const result = gradeAnswer(question, answer);
    setGrade(result);
    setSessionCount((count) => count + 1);
    setSessionCorrect((count) => count + Number(result.correct));
    setStudy((previous) =>
      recordAnswer(previous, {
        id: question.id,
        at: new Date().toISOString(),
        format: question.format,
        correct: result.correct,
        results: result.results,
      }),
    );
  };
  const answered =
    question?.format === "matching"
      ? question.targets.every(
          (term) => typeof answer === "object" && !!answer[term.id],
        )
      : typeof answer === "string" && !!answer.trim();
  const selectCategory = (id: string) =>
    updateSettings({
      ...settings,
      categoryIds: settings.categoryIds.includes(id)
        ? settings.categoryIds.filter((value) => value !== id)
        : [...settings.categoryIds, id],
    });
  const selectFormat = (format: Format) => {
    const next = settings.formats.includes(format)
      ? settings.formats.filter((value) => value !== format)
      : [...settings.formats, format];
    if (next.length) updateSettings({ ...settings, formats: next });
  };
  const searchResults = useMemo(() => {
    const search = normalizeAnswer(query);
    return terms.filter(
      (term) =>
        (!listCategory || term.categoryIds.includes(listCategory)) &&
        (!weakList || isWeak(study.stats[term.id])) &&
        (!search ||
          normalizeAnswer(
            [term.name, term.reading, ...term.aliases].join(" "),
          ).includes(search)),
    );
  }, [terms, query, listCategory, weakList, study.stats]);

  const categoryName = (term: Term) =>
    term.categoryIds
      .map(
        (id) => data?.categories.find((category) => category.id === id)?.name,
      )
      .filter(Boolean)
      .join(" / ");
  const sourceLink = (term: Term) => (
    <a
      className="source-link"
      href={term.sourceUrl}
      target="_blank"
      rel="noreferrer"
    >
      用語集で詳しく読む
      <ArrowUpRight size={14} />
    </a>
  );
  const termDescription = (term: Term) => (
    <>
      <p>{term.definition}</p>
      <div className="term-meta">{term.subcategories.join(" / ")}</div>
      {sourceLink(term)}
    </>
  );
  const StatsCards = () => (
    <div className="stats-cards">
      <div className="stat">
        <span className="stat-icon blue">
          <BookOpen size={20} />
        </span>
        <div>
          <span className="stat-label">学習した用語</span>
          <strong>
            {number(learned)}
            <small> / {number(terms.length)}語</small>
          </strong>
        </div>
      </div>
      <div className="stat">
        <span className="stat-icon green">
          <Target size={20} />
        </span>
        <div>
          <span className="stat-label">これまでの正答率</span>
          <strong>
            {percent ?? "—"}
            <small>{percent !== null ? "%" : ""}</small>
          </strong>
        </div>
      </div>
      <div className="stat">
        <span className="stat-icon amber">
          <RotateCcw size={20} />
        </span>
        <div>
          <span className="stat-label">復習したい用語</span>
          <strong>
            {number(weak.length)}
            <small>語</small>
          </strong>
        </div>
      </div>
    </div>
  );
  const Activity = () => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - 6 + index);
      return {
        date,
        count: study.history.filter(
          (item) => dateKey(new Date(item.at)) === dateKey(date),
        ).length,
      };
    });
    const max = Math.max(5, ...days.map((day) => day.count));
    return (
      <div className="activity panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR LITTLE STEPS</span>
            <h3>この1週間の積み重ね</h3>
          </div>
          <span className="subtle-tag">直近7日間</span>
        </div>
        <div className="activity-bars">
          {days.map((day, index) => (
            <div className="day" key={index}>
              <span className="bar-count">{day.count || ""}</span>
              <div className="bar-track">
                <div
                  title={`${day.date.getMonth() + 1}/${day.date.getDate()}：${day.count}問`}
                  className={index === 6 ? "today-bar" : ""}
                  style={{
                    height: `${day.count ? Math.max(7, (day.count / max) * 100) : 3}%`,
                  }}
                />
              </div>
              <span className={index === 6 ? "today-label" : ""}>
                {index === 6
                  ? "今日"
                  : day.date.toLocaleDateString("ja-JP", { weekday: "short" })}
              </span>
            </div>
          ))}
        </div>
        <p className="small muted">
          {today.length
            ? `今日は${today.length}問に挑戦。ひとつひとつの理解が、力になります。`
            : "まだ記録がありません。最初の1問から、はじめましょう。"}
        </p>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("home")}>
          <span className="brand-mark">
            <Layers3 size={25} strokeWidth={1.8} />
          </span>
          <span>
            ことばの積み重ね<small>応用情報 用語トレーニング</small>
          </span>
        </button>
        <span className="nav-caption">MY STUDY SPACE</span>
        <nav aria-label="メインナビゲーション">
          {(
            [
              { key: "home", label: "ホーム", icon: Home },
              { key: "setup", label: "学習する", icon: BookOpen },
              { key: "glossary", label: "用語を探す", icon: Search },
              {
                key: "stats",
                label: "学習記録",
                icon: ChartNoAxesColumnIncreasing,
              },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              className={`nav-item ${screen === item.key || (item.key === "setup" && screen === "quiz") ? "active" : ""}`}
              onClick={() => navigate(item.key)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.key === "setup" && (
                <ChevronRight className="nav-chevron" size={15} />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <Lightbulb size={21} />
          </span>
          <strong>小さな「わかった」を、毎日。</strong>
          <p>
            1問だけでも、立派な一歩。
            <br />
            あなたのペースで続けましょう。
          </p>
          <div className="note-lines">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="sidebar-footer">
          <ShieldCheck size={15} />
          <span>記録はこのブラウザに保存</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => navigate("home")}>
            <span className="brand-mark">
              <Layers3 size={22} />
            </span>
            ことばの積み重ね
          </button>
          <span className="breadcrumb">
            学習スペース <ChevronRight size={13} />{" "}
            {
              {
                home: "ホーム",
                setup: "学習設定",
                quiz: "トレーニング",
                glossary: "用語集",
                stats: "学習記録",
              }[screen]
            }
          </span>
          <div className="topbar-right">
            <span className="syllabus-tag">
              <span />
              シラバス 7.2 対応
            </span>
            <span className="avatar" aria-label="個人用アカウント">
              ME
            </span>
          </div>
        </header>
        <main className={`content ${screen === "quiz" ? "quiz-content" : ""}`}>
          {saveError && (
            <div className="notice error" role="alert">
              <CircleHelp size={18} />
              <span>{saveError}</span>
            </div>
          )}
          {loadError ? (
            <div className="empty-panel panel" role="alert">
              <CircleHelp size={32} />
              <h1>用語を読み込めませんでした</h1>
              <p>{loadError}</p>
              <button
                className="primary"
                onClick={() => setReload((value) => value + 1)}
              >
                もう一度読み込む
              </button>
            </div>
          ) : !data ? (
            <div className="loading" role="status">
              <LoaderCircle className="spin" />
              用語を準備しています…
            </div>
          ) : (
            <>
              {screen === "home" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">A LITTLE EVERY DAY</span>
                      <h1>今日も、一語ずつ。</h1>
                      <p>「なんとなく知っている」を、「ちゃんとわかる」に。</p>
                    </div>
                    <span className="date-label">
                      <Clock3 size={15} />
                      {new Date().toLocaleDateString("ja-JP", {
                        month: "long",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </span>
                  </div>
                  <StatsCards />
                  <section className="hero panel">
                    <div className="hero-copy">
                      <span className="hero-badge">
                        <Sparkles size={14} /> 毎日の理解を、少しずつ。
                      </span>
                      <h2>
                        ひとつの用語から、
                        <br />
                        知識がつながっていく。
                      </h2>
                      <p>
                        5つの出題形式で、理解を深める。
                        <br />
                        苦手なところは、繰り返して自分の力に。
                      </p>
                      <button
                        className="primary"
                        onClick={() => navigate("setup")}
                      >
                        学習をはじめる
                        <ArrowRight size={18} />
                      </button>
                      <span className="hero-footnote">
                        1問からOK・問題数は自由
                      </span>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <span className="art-orbit orbit-one" />
                      <span className="art-orbit orbit-two" />
                      <div className="floating-chip chip-top">
                        <CircleCheck size={15} />
                        わかった！
                      </div>
                      <div className="art-book book-back" />
                      <div className="art-book book-middle" />
                      <div className="art-book book-front">
                        <span className="book-label">KEYWORD</span>
                        <BookOpen size={57} strokeWidth={1.3} />
                        <strong>知識のノート</strong>
                        <span className="book-rule" />
                        <span className="book-rule short" />
                      </div>
                      <div className="floating-chip chip-bottom">
                        <Flame size={16} />
                        一歩ずつ、着実に。
                      </div>
                      <i className="art-dot dot-one" />
                      <i className="art-dot dot-two" />
                      <i className="art-star">✦</i>
                    </div>
                  </section>
                  <div className="section-title">
                    <h2>自分に合った学び方で</h2>
                    <span>ちょっとした時間を、学ぶ時間に。</span>
                  </div>
                  <div className="learning-options">
                    <button
                      className="learning-card panel"
                      onClick={() => navigate("setup")}
                    >
                      <span className="learning-icon blue">
                        <Layers3 size={23} />
                      </span>
                      <div>
                        <h3>いろいろな形式で学ぶ</h3>
                        <p>四択・○×・入力・穴埋め・組み合わせ</p>
                        <span className="text-link">
                          出題をカスタマイズ
                          <ArrowRight size={15} />
                        </span>
                      </div>
                      <ChevronRight className="card-chevron" size={18} />
                    </button>
                    <button
                      className="learning-card panel"
                      onClick={() => {
                        const next = { ...settings, weakOnly: true };
                        updateSettings(next);
                        setScreen("setup");
                      }}
                    >
                      <span className="learning-icon green">
                        <RotateCcw size={23} />
                      </span>
                      <div>
                        <h3>苦手を、得意に変える</h3>
                        <p>
                          {weak.length
                            ? `${weak.length}語の復習から、理解をもう一度。`
                            : "学習するほど、あなたに合った復習に。"}
                        </p>
                        <span className="text-link">
                          苦手な用語を復習
                          <ArrowRight size={15} />
                        </span>
                      </div>
                      <ChevronRight className="card-chevron" size={18} />
                    </button>
                  </div>
                  <div className="home-bottom">
                    <Activity />
                    <div className="coverage panel">
                      <span className="coverage-icon">
                        <BookOpen size={24} />
                      </span>
                      <span className="eyebrow">WORDS TO EXPLORE</span>
                      <h3>試験の用語を、ひととおり。</h3>
                      <strong>
                        {number(terms.length)}
                        <span>語</span>
                      </strong>
                      <p>
                        23分野すべてを収録。
                        <br />
                        気になる用語は、検索ですぐに。
                      </p>
                      <button
                        className="text-link"
                        onClick={() => navigate("glossary")}
                      >
                        用語集を見る
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {screen === "setup" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">MAKE IT YOURS</span>
                      <h1>今日の学び方を選ぼう。</h1>
                      <p>分野も、問題の形式も。今の自分に合わせて。</p>
                    </div>
                  </div>
                  <div className="setup-grid">
                    <div>
                      <section className="panel setting-section">
                        <div className="section-heading">
                          <h2>
                            <Layers3 size={21} />
                            出題形式
                          </h2>
                          <button
                            className="text-link"
                            onClick={() =>
                              updateSettings({
                                ...settings,
                                formats: [...formats],
                              })
                            }
                          >
                            すべて選択
                          </button>
                        </div>
                        <p className="muted small">
                          1つ以上選択してください。複数選ぶとランダムに出題します。
                        </p>
                        <div className="format-grid">
                          {formats.map((format, index) => (
                            <label
                              key={format}
                              className={`format-option ${settings.formats.includes(format) ? "checked" : ""}`}
                            >
                              <input
                                type="checkbox"
                                aria-label={formatNames[format]}
                                checked={settings.formats.includes(format)}
                                onChange={() => selectFormat(format)}
                              />
                              <span className="format-symbol">
                                {["A", "○×", "Aa", "［ ］", "↔"][index]}
                              </span>
                              <strong>{formatNames[format]}</strong>
                              <span className="check-circle">
                                {settings.formats.includes(format) && (
                                  <Check size={12} />
                                )}
                              </span>
                            </label>
                          ))}
                        </div>
                      </section>
                      <section className="panel setting-section">
                        <div className="section-heading">
                          <h2>
                            <ListFilter size={21} />
                            出題する分野
                          </h2>
                          <button
                            className="text-link"
                            onClick={() =>
                              updateSettings({ ...settings, categoryIds: [] })
                            }
                          >
                            すべての分野
                          </button>
                        </div>
                        <p className="muted small">
                          選択がない場合は、すべての分野から出題します。
                        </p>
                        <div className="category-grid">
                          {data.categories.map((category) => (
                            <label
                              key={category.id}
                              className={`category-option ${settings.categoryIds.includes(category.id) ? "checked" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={settings.categoryIds.includes(
                                  category.id,
                                )}
                                onChange={() => selectCategory(category.id)}
                              />
                              <span>{category.name}</span>
                              <small>
                                {
                                  terms.filter((term) =>
                                    term.categoryIds.includes(category.id),
                                  ).length
                                }
                              </small>
                            </label>
                          ))}
                        </div>
                      </section>
                    </div>
                    <aside className="setup-summary panel">
                      <span className="eyebrow">READY WHEN YOU ARE</span>
                      <h2>
                        自分のペースで、
                        <br />
                        はじめましょう。
                      </h2>
                      <div className="summary-count">
                        {number(available.length)}
                        <small>語が出題対象</small>
                      </div>
                      <dl>
                        <div>
                          <dt>出題形式</dt>
                          <dd>
                            {settings.formats.length === 5
                              ? "すべての形式"
                              : settings.formats
                                  .map((f) => formatNames[f])
                                  .join("・")}
                          </dd>
                        </div>
                        <div>
                          <dt>出題分野</dt>
                          <dd>
                            {settings.categoryIds.length
                              ? `${settings.categoryIds.length}分野を選択`
                              : "すべての分野"}
                          </dd>
                        </div>
                        <div>
                          <dt>問題数</dt>
                          <dd>自由に続けられます</dd>
                        </div>
                      </dl>
                      <label className="toggle-row">
                        <span>
                          <strong>苦手な用語を中心に復習</strong>
                          <small>間違えた用語を集中的に</small>
                        </span>
                        <input
                          role="switch"
                          type="checkbox"
                          checked={settings.weakOnly}
                          onChange={(event) =>
                            updateSettings({
                              ...settings,
                              weakOnly: event.target.checked,
                            })
                          }
                        />
                        <span className="toggle-visual" />
                      </label>
                      {!available.length && (
                        <p className="notice small">
                          {settings.weakOnly
                            ? "この範囲に苦手な用語はありません。通常の学習で新しい用語に挑戦しましょう。"
                            : "出題できる用語がありません。分野を変更してください。"}
                        </p>
                      )}
                      <button
                        className="primary wide"
                        disabled={!available.length}
                        onClick={() => start()}
                      >
                        この設定で学習する
                        <ArrowRight size={18} />
                      </button>
                      <p className="small muted summary-note">
                        <ShieldCheck size={14} />
                        回答は1問ごとに保存されます
                      </p>
                    </aside>
                  </div>
                </>
              )}

              {screen === "quiz" && (
                <>
                  <div className="quiz-topline">
                    <button
                      className="text-link"
                      onClick={() => setScreen("home")}
                    >
                      <X size={17} />
                      学習を終える
                    </button>
                    <span>
                      {sessionCount}問回答・{sessionCorrect}問正解
                    </span>
                  </div>
                  {!question ? (
                    <div className="panel empty-panel">
                      <CircleCheck size={45} />
                      <h1>ひと区切り、おつかれさま。</h1>
                      <p>
                        {settings.weakOnly
                          ? "この範囲の苦手な用語は、すべて復習できました。"
                          : "出題できる用語がありません。設定を見直してください。"}
                      </p>
                      <button
                        className="primary"
                        onClick={() => navigate("setup")}
                      >
                        学習設定へ戻る
                      </button>
                    </div>
                  ) : (
                    <section className="question-card panel" key={question.id}>
                      <div className="question-meta">
                        <span className="question-format">
                          {formatNames[question.format]}
                        </span>
                        <span>
                          {sessionCount + (grade ? 0 : 1)}問目{" "}
                          <span className="muted">/ 自由に続ける</span>
                        </span>
                      </div>
                      <span className="question-category">
                        {categoryName(question.term)}
                      </span>
                      <h1 ref={heading} tabIndex={-1}>
                        {question.prompt}
                      </h1>
                      {question.format !== "matching" && (
                        <div
                          className={`question-text ${question.format === "cloze" ? "cloze-text" : ""}`}
                        >
                          {question.format === "truefalse" ? (
                            <>
                              <strong>{question.text.split("\n")[0]}</strong>
                              <span>
                                {question.text.split("\n").slice(1).join("\n")}
                              </span>
                            </>
                          ) : (
                            question.text
                          )}
                        </div>
                      )}
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (answered) submit();
                        }}
                      >
                        {question.format === "input" ? (
                          <div className="input-answer">
                            <label htmlFor="term-answer">用語を入力</label>
                            <input
                              id="term-answer"
                              autoComplete="off"
                              autoCapitalize="none"
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" &&
                                  event.nativeEvent.isComposing
                                )
                                  event.preventDefault();
                              }}
                              value={typeof answer === "string" ? answer : ""}
                              onChange={(event) =>
                                setAnswer(event.target.value)
                              }
                              disabled={!!grade}
                              placeholder="用語・略称・英語名を入力"
                            />
                            <p className="small muted">
                              英字の大小・全半角・前後の空白は区別しません。
                            </p>
                          </div>
                        ) : question.format === "matching" ? (
                          <Matching
                            question={question}
                            value={typeof answer === "object" ? answer : {}}
                            onChange={setAnswer}
                            disabled={!!grade}
                          />
                        ) : (
                          <div
                            className={`answer-options ${question.format === "truefalse" ? "binary-options" : ""}`}
                            role="radiogroup"
                            aria-label="回答の選択肢"
                          >
                            {question.options.map((option, index) => (
                              <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={answer === option.id}
                                disabled={!!grade}
                                className={`answer-option ${answer === option.id ? "selected" : ""} ${grade && option.id === question.correctOption ? "correct-option" : ""} ${grade && answer === option.id && option.id !== question.correctOption ? "wrong-option" : ""}`}
                                onClick={() => setAnswer(option.id)}
                              >
                                {question.format !== "truefalse" && (
                                  <span className="option-letter">
                                    {"ABCD"[index]}
                                  </span>
                                )}
                                <span>{option.text}</span>
                                {grade &&
                                option.id === question.correctOption ? (
                                  <CircleCheck size={20} />
                                ) : (
                                  <span className="option-radio" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        {!grade && (
                          <div className="answer-actions">
                            <span className="small muted">
                              焦らず、考えてみましょう。
                            </span>
                            <button
                              type="submit"
                              className="primary"
                              disabled={!answered}
                            >
                              回答する
                              <Check size={18} />
                            </button>
                          </div>
                        )}
                      </form>
                      {grade && (
                        <div
                          className={`feedback ${grade.correct ? "success" : "incorrect"}`}
                          role="status"
                        >
                          <div className="feedback-heading">
                            {grade.correct ? (
                              <CircleCheck size={25} />
                            ) : (
                              <Lightbulb size={25} />
                            )}
                            <div>
                              <h2>
                                {grade.correct
                                  ? "正解です！"
                                  : "ここで覚えて、次の一歩に。"}
                              </h2>
                              <p>
                                {grade.correct
                                  ? "理解がひとつ、積み重なりました。"
                                  : question.format === "matching"
                                    ? `${grade.results.filter((result) => result.correct).length} / ${grade.results.length}組が正解です。`
                                    : "正解と解説を確認しましょう。"}
                              </p>
                            </div>
                          </div>
                          {question.format === "truefalse" && (
                            <p className="answer-reveal">
                              正解：
                              {question.correctOption === "true"
                                ? "○ 正しい"
                                : "× 誤り"}
                            </p>
                          )}
                          {(question.format === "matching"
                            ? question.targets
                            : [question.term]
                          ).map((term) => (
                            <div className="explanation" key={term.id}>
                              <strong>
                                {question.format === "matching" &&
                                  (grade.results.find(
                                    (item) => item.termId === term.id,
                                  )?.correct
                                    ? "○ "
                                    : "× ")}
                                {term.name}
                              </strong>
                              {termDescription(term)}
                              {question.format === "input" &&
                                term.aliases.length > 0 && (
                                  <p className="small muted">
                                    登録された別名：{term.aliases.join(" / ")}
                                  </p>
                                )}
                            </div>
                          ))}
                          <div className="next-actions">
                            <button
                              className="text-link"
                              onClick={() => setScreen("home")}
                            >
                              ここでひと休み
                            </button>
                            <button
                              className="primary"
                              onClick={() => generate(settings, recent)}
                            >
                              次の問題へ
                              <ArrowRight size={18} />
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}

              {screen === "glossary" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">EXPLORE THE WORDS</span>
                      <h1>気になる用語を、ひとつ。</h1>
                      <p>
                        全23分野・{number(terms.length)}
                        語。学習の前にも、答え合わせにも。
                      </p>
                    </div>
                  </div>
                  <div className="glossary-tools panel">
                    <label className="search-box">
                      <Search size={20} />
                      <input
                        type="search"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setVisible(40);
                        }}
                        placeholder="用語・読み・英語名で検索"
                        aria-label="用語を検索"
                      />
                    </label>
                    <select
                      aria-label="用語集の分野"
                      value={listCategory}
                      onChange={(event) => {
                        setListCategory(event.target.value);
                        setVisible(40);
                      }}
                    >
                      <option value="">すべての分野</option>
                      {data.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <label className="weak-checkbox">
                      <input
                        type="checkbox"
                        checked={weakList}
                        onChange={(event) => {
                          setWeakList(event.target.checked);
                          setVisible(40);
                        }}
                      />
                      苦手な用語のみ
                    </label>
                  </div>
                  <div className="list-meta">
                    <span>
                      {number(searchResults.length)}語が見つかりました
                    </span>
                    <span>
                      タップして解説を表示
                      <ChevronDown size={14} />
                    </span>
                  </div>
                  <div className="term-list panel">
                    {searchResults.slice(0, visible).map((term) => (
                      <details className="term-row" key={term.id}>
                        <summary>
                          <span>
                            <strong>{term.name}</strong>
                            <small>{term.reading}</small>
                          </span>
                          <span className="term-row-right">
                            {isWeak(study.stats[term.id]) && (
                              <span className="weak-tag">復習</span>
                            )}
                            <span className="category-label">
                              {categoryName(term)}
                            </span>
                            <ChevronDown size={18} />
                          </span>
                        </summary>
                        <div className="term-detail">
                          {termDescription(term)}
                        </div>
                      </details>
                    ))}
                    {!searchResults.length && (
                      <div className="empty-panel">
                        <Search size={30} />
                        <h2>該当する用語がありません</h2>
                        <p>検索する言葉や分野を変えてみてください。</p>
                      </div>
                    )}
                  </div>
                  {searchResults.length > visible && (
                    <button
                      className="secondary load-more"
                      onClick={() => setVisible((value) => value + 40)}
                    >
                      さらに40語を表示
                      <ArrowDown size={16} />
                    </button>
                  )}
                  <p className="attribution">
                    {data.attribution}
                    <br />
                    掲載{number(data.sourceEntryCount)}
                    件の重複を整理し、すべての所属分野を保持しています。
                  </p>
                </>
              )}

              {screen === "stats" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">LOOK HOW FAR YOU'VE COME</span>
                      <h1>積み重ねが、見えてくる。</h1>
                      <p>
                        できたことも、これからのことも。次の一歩のヒントに。
                      </p>
                    </div>
                    <span className="saved-note">
                      <ShieldCheck size={15} />
                      {saveError
                        ? "保存状況を確認してください"
                        : "このブラウザに保存済み"}
                    </span>
                  </div>
                  <StatsCards />
                  <div className="home-bottom stats-bottom">
                    <Activity />
                    <div className="panel mastery">
                      <span className="learning-icon green">
                        <Sparkles size={25} />
                      </span>
                      <h3>理解が深まった用語</h3>
                      <strong>
                        {mastered}
                        <small>語</small>
                      </strong>
                      <p>2回以上連続で正解した用語です。</p>
                      <div className="mastery-track">
                        <span
                          style={{
                            width: `${terms.length ? (mastered / terms.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="small muted">
                        全体の
                        {((mastered / Math.max(1, terms.length)) * 100).toFixed(
                          1,
                        )}
                        %
                      </span>
                    </div>
                  </div>
                  <div className="section-title">
                    <h2>最近の学習</h2>
                    <span>
                      全{number(study.history.length)}問のうち、直近50問
                    </span>
                  </div>
                  <div className="panel history-list">
                    {study.history.slice(0, 50).map((item) => (
                      <div className="history-row" key={item.id}>
                        <span
                          className={`history-result ${item.correct ? "right" : "wrong"}`}
                        >
                          {item.correct ? <Check size={18} /> : <X size={18} />}
                        </span>
                        <div className="history-name">
                          <strong>
                            {item.results
                              .map(
                                (result) =>
                                  termMap.get(result.termId)?.name ??
                                  "収録外の用語",
                              )
                              .join("・")}
                          </strong>
                          <span>
                            {formatNames[item.format]} ·{" "}
                            {new Date(item.at).toLocaleString("ja-JP", {
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <span className="small muted">
                          {item.correct ? "正解" : "復習しよう"}
                        </span>
                      </div>
                    ))}
                    {!study.history.length && (
                      <div className="empty-panel">
                        <BookOpen size={32} />
                        <h3>記録は、最初の1問から。</h3>
                        <p>学習をはじめると、ここに積み重なっていきます。</p>
                        <button
                          className="primary"
                          onClick={() => navigate("setup")}
                        >
                          学習をはじめる
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  <section className="data-note">
                    <ShieldCheck size={19} />
                    <div>
                      <strong>
                        学習記録は、このブラウザだけに保存されます。
                      </strong>
                      <p>
                        別の端末・ブラウザには引き継がれません。ブラウザのデータ削除でも記録は消去されます。
                      </p>
                      <button
                        className="danger-link"
                        onClick={() => {
                          if (
                            window.confirm(
                              "回答履歴・正答率・出題設定をすべて初期化します。この操作は元に戻せません。続けますか？",
                            )
                          ) {
                            const next = emptyState();
                            setStudy(next);
                            setSettings(defaultSettings());
                            setBlocked(false);
                            setSaveError("");
                          }
                        }}
                      >
                        学習記録と設定を初期化する
                      </button>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>一語ずつ、理解を自分のものに。</span>
            <a
              href="https://www.ap-siken.com/keyword/"
              target="_blank"
              rel="noreferrer"
            >
              用語の出典
              <ArrowUpRight size={12} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
