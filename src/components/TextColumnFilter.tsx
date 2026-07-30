import { useEffect, useState } from "react";

type Props = {
  value: string;
  onApply: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

export function TextColumnFilter({ value, onApply, placeholder = "關鍵字...", debounceMs = 300 }: Props) {
  const [draft, setDraft] = useState(() => String(value ?? ""));
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!composing) setDraft(String(value ?? ""));
  }, [value, composing]);

  useEffect(() => {
    if (composing || draft === String(value ?? "")) return;
    const timer = window.setTimeout(() => onApply(draft), debounceMs);
    return () => window.clearTimeout(timer);
  }, [draft, composing, value, onApply, debounceMs]);

  function update(nextValue: string) {
    setDraft(nextValue);
  }

  return (
    <input
      autoFocus
      className="field"
      value={draft}
      onCompositionStart={() => setComposing(true)}
      onCompositionUpdate={(event) => update(event.currentTarget.value)}
      onCompositionEnd={(event) => {
        const nextValue = event.currentTarget.value;
        update(nextValue);
        setComposing(false);
      }}
      onChange={(event) => update(event.currentTarget.value)}
      placeholder={placeholder}
    />
  );
}
