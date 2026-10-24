import { useRef, useState } from "react";
import { GripVertical, MoveUpRight, X } from "lucide-react";
import type { Question } from "./lib/types.ts";

interface Props {
  question: Question;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled: boolean;
}
export default function Matching({
  question,
  value,
  onChange,
  disabled,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const origin = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const place = (target: string, id: string) => {
    if (disabled) return;
    const next = Object.fromEntries(
      Object.entries(value).filter(
        ([key, item]) => key !== target && item !== id,
      ),
    );
    onChange({ ...next, [target]: id });
    setSelected(null);
  };
  return (
    <div className="matching">
      <p className="small muted drag-instruction">
        <MoveUpRight size={15} /> 用語を説明の枠へドラッグ。タップでも選べます。
      </p>
      <div className="match-sources" aria-label="組み合わせる用語">
        {question.pairs.map((term) => (
          <button
            key={term.id}
            type="button"
            className={`drag-term ${selected === term.id ? "selected" : ""} ${Object.values(value).includes(term.id) ? "placed" : ""}`}
            disabled={disabled}
            aria-pressed={selected === term.id}
            data-drag={term.id}
            onPointerDown={(event) => {
              if (disabled || event.button !== 0) return;
              origin.current = {
                id: term.id,
                x: event.clientX,
                y: event.clientY,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = origin.current;
              if (!start || start.id !== term.id) return;
              if (
                Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
              )
                start.moved = true;
              if (start.moved) {
                setGhost({ id: term.id, x: event.clientX, y: event.clientY });
                const bottomInset = window.matchMedia("(max-width: 700px)")
                  .matches
                  ? 85
                  : 20;
                if (event.clientY > window.innerHeight - bottomInset - 30)
                  window.scrollBy(0, 16);
                else if (event.clientY < 65 && window.scrollY > 0)
                  window.scrollBy(0, -16);
              }
            }}
            onPointerUp={(event) => {
              const start = origin.current;
              if (!start) return;
              if (start.moved) {
                const target = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>("[data-drop]");
                if (target?.dataset.drop) place(target.dataset.drop, term.id);
                suppressClick.current = true;
              }
              origin.current = null;
              setGhost(null);
            }}
            onPointerCancel={() => {
              origin.current = null;
              setGhost(null);
            }}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              setSelected(selected === term.id ? null : term.id);
            }}
          >
            <GripVertical size={16} aria-hidden="true" />
            <span>{term.name}</span>
          </button>
        ))}
      </div>
      <div className="match-targets">
        {question.targets.map((term, index) => {
          const assigned = question.pairs.find(
            (item) => item.id === value[term.id],
          );
          return (
            <div
              key={term.id}
              className={`match-target ${assigned ? "filled" : ""} ${selected ? "ready" : ""}`}
              data-drop={term.id}
            >
              <div className="target-description">
                <span className="target-number">{index + 1}</span>
                <p>{term.definition}</p>
              </div>
              <button
                type="button"
                className="drop-slot"
                data-drop={term.id}
                disabled={disabled || !selected}
                aria-label={`説明${index + 1}に選択した用語を配置`}
                onClick={() => selected && place(term.id, selected)}
              >
                {assigned?.name ?? "ここに用語をドロップ"}
              </button>
              {assigned && !disabled && (
                <button
                  className="unassign"
                  aria-label={`説明${index + 1}の割り当てを解除`}
                  onClick={() => {
                    const next = { ...value };
                    delete next[term.id];
                    onChange(next);
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
          {question.pairs.find((term) => term.id === ghost.id)?.name}
        </div>
      )}
    </div>
  );
}
