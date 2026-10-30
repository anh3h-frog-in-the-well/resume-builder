"use client";

import type { FieldProps } from "../interface/resume";

export default function ResumeField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline = false,
  disabled = false,
  hint,
}: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          disabled={disabled}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
