import { screen, within } from "@testing-library/react";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ResumeField wraps the label text, the control and an optional hint inside a
 * single <label>, so the accessible name starts with the label text and may be
 * followed by the hint. Match on the leading text only.
 */
export function labelPattern(label: string) {
  return new RegExp(`^${escapeRegExp(label)}`);
}

export function getField(label: string, container?: HTMLElement) {
  const scope = container ? within(container) : screen;
  return scope.getByLabelText(labelPattern(label));
}

export function getAllFields(label: string, container?: HTMLElement) {
  const scope = container ? within(container) : screen;
  return scope.getAllByLabelText(labelPattern(label));
}
