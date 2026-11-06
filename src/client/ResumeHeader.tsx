"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import type { Resume } from "../interface/resume";
import { downloadJson, downloadWord } from "../util/helper";
import Icon from "./Icon";

type ResumeHeaderProps = {
  resume: Resume;
  saveLabel: string;
  isImportingJson: boolean;
  onJsonImport: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Control for choosing between the account's resume versions. */
  resumeSwitcher?: ReactNode;
};

export default function ResumeHeader({
  resume,
  saveLabel,
  isImportingJson,
  onJsonImport,
  resumeSwitcher,
}: ResumeHeaderProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>My resumes</span>
        {resumeSwitcher && (
          <>
            <span className="breadcrumb-divider">/</span>
            {resumeSwitcher}
          </>
        )}
      </div>
      <div className="topbar-actions">
        <span className="save-status">
          <span className="save-dot" />
          {saveLabel}
        </span>
        <label
          className={`import-button ${isImportingJson ? "is-loading" : ""}`}
          htmlFor="resume-json-import"
          aria-disabled={isImportingJson}
          aria-label="Import JSON"
          title="Import JSON"
        >
          <Icon name="file" size={15} />
          {isImportingJson ? "Importing..." : "Import JSON"}
        </label>
        <input
          className="visually-hidden"
          id="resume-json-import"
          type="file"
          accept="application/json,.json"
          disabled={isImportingJson}
          onChange={onJsonImport}
        />
        <button
          type="button"
          className="export-button"
          onClick={() => setExportMenuOpen((open) => !open)}
          aria-expanded={exportMenuOpen}
        >
          <Icon name="download" size={16} />
          Export
          <span className="button-chevron">⌄</span>
        </button>
        {exportMenuOpen && (
          <div className="export-menu">
            <button
              type="button"
              onClick={() => {
                downloadJson(resume);
                setExportMenuOpen(false);
              }}
            >
              <Icon name="file" size={16} />
              <span>
                <strong>JSON file</strong>
                <small>Download resume data</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                downloadWord(resume);
                setExportMenuOpen(false);
              }}
            >
              <Icon name="file" size={16} />
              <span>
                <strong>Word document</strong>
                <small>Download as .doc</small>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setExportMenuOpen(false);
                window.print();
              }}
            >
              <Icon name="file" size={16} />
              <span>
                <strong>Save as PDF</strong>
                <small>Print or save to PDF</small>
              </span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
