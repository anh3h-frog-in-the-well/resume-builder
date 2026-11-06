"use client";

import { useState, type FormEvent } from "react";
import type { ResumeVersionSummary } from "../interface/resume";
import {
  maxResumeTitleLength,
  maxResumeVersions,
  normalizeResumeTitle,
} from "../util/resume-helper";
import Icon from "./Icon";

type ResumeSwitcherProps = {
  versions: ResumeVersionSummary[];
  activeId: string | null;
  /** True while a version request (open, create, rename, delete) is running. */
  isBusy: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: () => void;
  onRename: (title: string) => Promise<boolean>;
  onDelete: () => void;
};

type MenuMode = "closed" | "list" | "rename" | "delete";

export default function ResumeSwitcher({
  versions,
  activeId,
  isBusy,
  onSelect,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
}: ResumeSwitcherProps) {
  const [mode, setMode] = useState<MenuMode>("closed");
  const [titleDraft, setTitleDraft] = useState("");
  const [titleError, setTitleError] = useState("");

  const active = versions.find((version) => version.id === activeId) ?? null;
  const atLimit = versions.length >= maxResumeVersions;
  const isOpen = mode !== "closed";

  const close = () => {
    setMode("closed");
    setTitleError("");
  };

  const startRename = () => {
    setTitleDraft(active?.title ?? "");
    setTitleError("");
    setMode("rename");
  };

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = normalizeResumeTitle(titleDraft);
    if (!title) {
      setTitleError(`Enter a title of up to ${maxResumeTitleLength} characters.`);
      return;
    }
    if (title === active?.title || (await onRename(title))) {
      close();
    }
  };

  return (
    <div className="resume-switcher">
      <button
        type="button"
        className="resume-switcher-button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Switch resume"
        disabled={!active || isBusy}
        onClick={() => (isOpen ? close() : setMode("list"))}
      >
        <strong>{active?.title ?? "Loading resumes..."}</strong>
        <span className="draft-badge">
          {versions.length} / {maxResumeVersions}
        </span>
        <span className="button-chevron">⌄</span>
      </button>

      {isOpen && active && (
        <div className="resume-menu" role="menu" aria-label="Your resumes">
          {mode === "rename" ? (
            <form className="resume-menu-form" onSubmit={(event) => void submitRename(event)}>
              <label>
                <span>Resume title</span>
                <input
                  autoFocus
                  value={titleDraft}
                  maxLength={maxResumeTitleLength}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  aria-invalid={titleError ? true : undefined}
                />
              </label>
              {titleError && <p className="resume-menu-error" role="alert">{titleError}</p>}
              <div className="resume-menu-form-actions">
                <button type="button" onClick={close}>Cancel</button>
                <button type="submit" className="is-primary" disabled={isBusy}>
                  Save title
                </button>
              </div>
            </form>
          ) : mode === "delete" ? (
            <div className="resume-menu-form">
              <p>
                Delete <strong>{active.title}</strong>? This cannot be undone.
              </p>
              <div className="resume-menu-form-actions">
                <button type="button" onClick={close}>Cancel</button>
                <button
                  type="button"
                  className="is-danger"
                  disabled={isBusy}
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                >
                  Delete resume
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="resume-menu-list">
                {versions.map((version) => {
                  const isActive = version.id === active.id;
                  return (
                    <li key={version.id}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        className={isActive ? "is-active" : ""}
                        onClick={() => {
                          close();
                          if (!isActive) onSelect(version.id);
                        }}
                      >
                        <span className="resume-menu-check">
                          {isActive && <Icon name="check" size={12} />}
                        </span>
                        <span className="resume-menu-title">{version.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="resume-menu-actions">
                <button
                  type="button"
                  role="menuitem"
                  disabled={atLimit}
                  title={atLimit ? `You can keep up to ${maxResumeVersions} resumes.` : undefined}
                  onClick={() => {
                    close();
                    onCreate();
                  }}
                >
                  <Icon name="plus" size={14} /> New blank resume
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={atLimit}
                  title={atLimit ? `You can keep up to ${maxResumeVersions} resumes.` : undefined}
                  onClick={() => {
                    close();
                    onDuplicate();
                  }}
                >
                  <Icon name="file" size={14} /> Duplicate this resume
                </button>
                <button type="button" role="menuitem" onClick={startRename}>
                  <Icon name="tag" size={14} /> Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  disabled={versions.length <= 1}
                  title={
                    versions.length <= 1
                      ? "Create another resume before deleting this one."
                      : undefined
                  }
                  onClick={() => setMode("delete")}
                >
                  <Icon name="trash" size={14} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
