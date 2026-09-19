import { useState, useEffect, type FocusEvent, type ChangeEvent } from "react";

interface NumericInputProps {
  value: number | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  allowZero?: boolean;
  "aria-label"?: string;
}

/**
 * NumericInput prevents common number input quirks:
 * 1. "0" is easily erasable without getting immediately snapped back by React state.
 * 2. Typing a digit when 0 is present transforms "02" -> "2" rather than sticking as "02".
 * 3. Focusing on 0 auto-selects it so any keystroke instantly overwrites it.
 */
export function NumericInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder,
  disabled = false,
  required = false,
  className,
  allowZero = true,
  "aria-label": ariaLabel,
}: NumericInputProps) {
  const [text, setText] = useState<string>(() => {
    if (value === undefined) return "";
    if (value === 0 && !allowZero) return "";
    return String(value);
  });

  // Keep internal text state synchronized with external prop updates
  useEffect(() => {
    if (value === undefined) {
      setText("");
      return;
    }

    // If the user has erased the field (text === ""), do not snap back to "0" while editing
    if (text === "" && value === 0 && allowZero) {
      return;
    }

    const currentNum = text === "" ? (allowZero ? 0 : NaN) : Number(text);
    if (currentNum !== value) {
      setText(value === 0 && !allowZero ? "" : String(value));
    }
  }, [value, allowZero]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // User erased the input
    if (raw === "") {
      setText("");
      onChange(0);
      return;
    }

    // Strip leading zeroes if followed by other digits (e.g. "02" -> "2", "00" -> "0")
    if (/^0\d+/.test(raw)) {
      raw = raw.replace(/^0+(?=\d)/, "");
      e.target.value = raw;
    }

    const num = Number(raw);
    if (!isNaN(num)) {
      if (max !== undefined && num > max) return;
      setText(raw);
      onChange(num);
    }
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    // Auto-select "0" so typing any digit or hitting backspace replaces it immediately
    if (e.target.value === "0") {
      e.target.select();
    }
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (text === "") {
      if (allowZero) {
        setText("0");
        e.target.value = "0";
        onChange(0);
      }
    } else {
      const sanitized = text.replace(/^0+(?=\d)/, "");
      if (sanitized !== text) {
        setText(sanitized);
        e.target.value = sanitized;
      }
    }
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      required={required}
      disabled={disabled}
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
