"use client";

import { useState } from "react";
import ResumeField from "./ResumeField";

export function TextInput() {
  const [value, setValue] = useState("");

  return (
    <>
      <ResumeField
        label="Full name"
        value={value}
        onChange={setValue}
        placeholder="Enter your name"
      />
      <output data-testid="field-value">{value}</output>
    </>
  );
}

export function Textarea() {
  const [value, setValue] = useState("");

  return (
    <>
      <ResumeField
        label="About you"
        value={value}
        onChange={setValue}
        multiline
        hint="Keep it concise."
      />
      <output data-testid="field-value">{value}</output>
    </>
  );
}
