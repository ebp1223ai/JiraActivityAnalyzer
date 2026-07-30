import { useEffect, useReducer, useRef } from "react";
import { createImeFilterState, reduceImeFilterState } from "../utils/imeFilterState";

type Props = {
  value: string;
  onApply: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  autoFocus?: boolean;
};

export function TextColumnFilter({ value, onApply, placeholder = "搜尋文字...", debounceMs = 300, autoFocus = false }: Props) {
  const [state, dispatch] = useReducer(reduceImeFilterState, value, createImeFilterState);
  const onApplyRef = useRef(onApply);

  useEffect(() => {
    onApplyRef.current = onApply;
  }, [onApply]);

  useEffect(() => {
    dispatch({ type: "external", value });
  }, [value]);

  useEffect(() => {
    if (state.isComposing || state.pendingCommit === null) return;
    const primitiveValue = state.pendingCommit;
    if (primitiveValue === state.committedValue) {
      dispatch({ type: "commit-applied", value: primitiveValue });
      return;
    }
    const timer = window.setTimeout(() => {
      onApplyRef.current(primitiveValue);
      dispatch({ type: "commit-applied", value: primitiveValue });
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [state.pendingCommit, state.committedValue, state.isComposing, state.revision, debounceMs]);

  return (
    <input
      autoFocus={autoFocus}
      className="field"
      value={state.draftValue}
      onCompositionStart={() => dispatch({ type: "composition-start" })}
      onCompositionUpdate={(event) => dispatch({ type: "composition-update", value: event.currentTarget.value })}
      onCompositionEnd={(event) => dispatch({ type: "composition-end", value: event.currentTarget.value })}
      onChange={(event) => dispatch({ type: "input", value: event.currentTarget.value })}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") dispatch({ type: "revert" });
      }}
      placeholder={placeholder}
    />
  );
}