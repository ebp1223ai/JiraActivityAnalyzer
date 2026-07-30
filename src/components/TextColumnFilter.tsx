import { useEffect, useReducer } from "react";
import { createImeFilterState, reduceImeFilterState } from "../utils/imeFilterState";

type Props = {
  value: string;
  onApply: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

export function TextColumnFilter({ value, onApply, placeholder = "關鍵字...", debounceMs = 300 }: Props) {
  const [state, dispatch] = useReducer(reduceImeFilterState, value, createImeFilterState);

  useEffect(() => {
    dispatch({ type: "external", value });
  }, [value]);

  useEffect(() => {
    if (state.composing || state.draft === String(value ?? "")) return;
    const primitiveValue = state.draft;
    const timer = window.setTimeout(() => onApply(primitiveValue), debounceMs);
    return () => window.clearTimeout(timer);
  }, [state.draft, state.composing, state.revision, value, onApply, debounceMs]);

  return (
    <input
      autoFocus
      className="field"
      value={state.draft}
      onCompositionStart={() => dispatch({ type: "composition-start" })}
      onCompositionUpdate={(event) => dispatch({ type: "composition-update", value: event.currentTarget.value })}
      onCompositionEnd={(event) => {
        const nextValue = event.currentTarget.value;
        dispatch({ type: "composition-end", value: nextValue });
      }}
      onChange={(event) => dispatch({ type: "input", value: event.currentTarget.value })}
      placeholder={placeholder}
    />
  );
}
