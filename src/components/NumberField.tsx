"use client";

import { useState } from "react";

interface NumberFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Whole numbers only (numeric keyboard on iOS). Default: decimals allowed. */
  integer?: boolean;
  /** Allow clearing the field to commit `null`. Default: false — an empty
   *  field reverts to the last value (or `min`) on blur. */
  allowEmpty?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

/**
 * A number input that never fights the user while they type.
 *
 * Controlled number inputs that coerce on every keystroke (`Number(e.target.value)`)
 * turn a cleared field into 0, so typing "4" produces "04". This field keeps the
 * raw text while focused and commits a clamped number on blur or Enter.
 */
export default function NumberField({
  value,
  onChange,
  min,
  max,
  integer = false,
  allowEmpty = false,
  id,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: NumberFieldProps) {
  // null while not editing → display derives from `value`
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === "") {
      if (allowEmpty) onChange(null);
      else if (value === null && min !== undefined) onChange(min);
      // otherwise keep the previous value
      return;
    }
    const parsed = integer ? parseInt(text, 10) : parseFloat(text);
    if (Number.isNaN(parsed)) return; // revert to previous value
    const next = clamp(integer ? Math.round(parsed) : parsed, min, max);
    if (next !== value) onChange(next);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      // Accept digits plus one separator; iOS shows the matching keypad.
      pattern={integer ? "[0-9]*" : "[0-9]*[.,]?[0-9]*"}
      value={draft ?? (value === null ? "" : String(value))}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={() => setDraft(value === null ? "" : String(value))}
      onChange={(e) => setDraft(e.target.value.replace(",", "."))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}
