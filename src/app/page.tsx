"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../client/Icon";
import AuthControl from "../client/AuthControl";
import EducationSection from "../client/EducationSection";
import ExperienceSection from "../client/ExperienceSection";
import PersonalInfoSection from "../client/PersonalInfoSection";
import ResumeHeader from "../client/ResumeHeader";
import ResumeSwitcher from "../client/ResumeSwitcher";
import SkillsSection from "../client/SkillsSection";
import type {
  ResumeSection,
  ResumeUpdater,
  ResumeVersionSummary,
  TemplateDetails,
  Resume,
} from "../interface/resume";
import {
  createBlankResume,
  createCopyTitle,
  normalizeResumeVersion,
  normalizeResumeVersionList,
  normalizeResumeVersionSummary,
  resumeTemplates,
} from "../util/resume-helper";
import { formatExperienceDates, handleJsonImport } from "../util/helper";

/** The version open in the editor, plus a counter of local edits. */
type ActiveDraft = {
  id: string;
  title: string;
  resume: Resume;
  /** Incremented on every local edit; 0 right after loading from the server. */
  revision: number;
};

const activeResumeStorageKey = "draftly-active-resume";
const backupStorageKey = "draftly-resume";

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
    ) {
      return payload.error;
    }
  } catch {
    // Fall through to the generic message.
  }
  return fallback;
}

function readStoredActiveId() {
  try {
    return window.localStorage.getItem(activeResumeStorageKey);
  } catch {
    return null;
  }
}

function writeStoredActiveId(id: string) {
  try {
    window.localStorage.setItem(activeResumeStorageKey, id);
  } catch (error) {
    console.error("Unable to remember the active resume.", error);
  }
}

const templateDetails: TemplateDetails = {
  modern: { name: "Modern", description: "Clean & confident" },
  classic: { name: "Classic", description: "Timeless & polished" },
  creative: { name: "Creative", description: "Warm & expressive" },
};

const sections = [
  { id: "personal", label: "Personal details", number: "01" },
  { id: "skills", label: "Skills", number: "02" },
  { id: "experience", label: "Work experience", number: "03" },
  { id: "education", label: "Education", number: "04" },
] as const;

export default function Home() {
  const [versions, setVersions] = useState<ResumeVersionSummary[]>([]);
  const [active, setActive] = useState<ActiveDraft | null>(null);
  const [isVersionBusy, setIsVersionBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<ResumeSection>("personal");
  const [saveLabel, setSaveLabel] = useState("Connecting to server...");
  const [noticeError, setNoticeError] = useState("");
  const [noticeStatus, setNoticeStatus] = useState("");
  const [isImportingJson, setIsImportingJson] = useState(false);
  /** The newest revision of each version that reached the server. */
  const savedRevisions = useRef<Record<string, number>>({});

  const showError = (message: string) => {
    setNoticeStatus("");
    setNoticeError(message);
  };

  const loadVersion = useCallback(async (id: string) => {
    const response = await fetch(`/api/resumes/${id}`);
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, `Database returned HTTP ${response.status}.`),
      );
    }
    const version = normalizeResumeVersion(await response.json());
    if (!version) {
      throw new Error("The server returned an invalid resume format.");
    }
    savedRevisions.current[version.id] = 0;
    setActive({ id: version.id, title: version.title, resume: version.resume, revision: 0 });
    writeStoredActiveId(version.id);
    return version;
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const response = await fetch("/api/resumes");
        if (!response.ok) {
          throw new Error(`Database returned HTTP ${response.status}.`);
        }
        const payload: unknown = await response.json();
        const list = normalizeResumeVersionList(payload);
        if (!list || list.length === 0) {
          throw new Error("The server returned an invalid resume list.");
        }
        const isNew =
          typeof payload === "object" &&
          payload !== null &&
          "isNew" in payload &&
          payload.isNew === true;

        const preferredId = readStoredActiveId();
        const initial = list.find((version) => version.id === preferredId) ?? list[0];
        await loadVersion(initial.id);
        setVersions(list);
        setSaveLabel(isNew ? "New draft" : "Restored from server");
      } catch (error) {
        console.error("Unable to restore your resumes from the server.", error);
        setSaveLabel("Server load failed");
      }
    };

    void bootstrap();
  }, [loadVersion]);

  /** Sends a draft to the server unless that revision was already saved. */
  const saveDraft = useCallback(async (draft: ActiveDraft) => {
    if ((savedRevisions.current[draft.id] ?? 0) >= draft.revision) return true;

    const serializedResume = JSON.stringify(draft.resume);
    try {
      window.localStorage.setItem(backupStorageKey, serializedResume);
    } catch (error) {
      console.error("Unable to save the browser backup.", error);
    }

    try {
      const response = await fetch(`/api/resumes/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: serializedResume,
      });
      if (!response.ok) {
        throw new Error(`Database returned HTTP ${response.status}.`);
      }
      savedRevisions.current[draft.id] = Math.max(
        savedRevisions.current[draft.id] ?? 0,
        draft.revision,
      );
      setSaveLabel("Saved");
      setVersions((current) =>
        current.map((version) =>
          version.id === draft.id
            ? { ...version, updatedAt: new Date().toISOString() }
            : version,
        ),
      );
      return true;
    } catch (error) {
      console.error("Unable to save your resume to Server.", error);
      setSaveLabel("Server save failed");
      return false;
    }
  }, []);

  useEffect(() => {
    if (!active || active.revision === 0) return;

    const timeoutId = window.setTimeout(() => {
      void saveDraft(active);
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [active, saveDraft]);

  /** Applies a local change to the open version and schedules an autosave. */
  const applyResume = (change: (current: Resume) => Resume) => {
    setSaveLabel("Unsaved changes");
    setActive((current) =>
      current
        ? { ...current, resume: change(current.resume), revision: current.revision + 1 }
        : current,
    );
  };

  const update: ResumeUpdater = (key, value) => {
    applyResume((current) => ({ ...current, [key]: value }));
  };

  /** Runs a version operation with the busy flag and pending edits flushed. */
  const runVersionAction = async (
    label: string,
    action: () => Promise<void>,
  ) => {
    if (isVersionBusy) return;
    setIsVersionBusy(true);
    setNoticeError("");
    try {
      if (active && !(await saveDraft(active))) {
        throw new Error("Your latest changes could not be saved. Please try again.");
      }
      await action();
    } catch (error) {
      console.error(`Unable to ${label}.`, error);
      showError(error instanceof Error ? error.message : `Unable to ${label}.`);
    } finally {
      setIsVersionBusy(false);
    }
  };

  const openVersion = (id: string) =>
    runVersionAction("open the resume", async () => {
      setSaveLabel("Loading resume...");
      try {
        await loadVersion(id);
        setSaveLabel("Restored from server");
      } catch (error) {
        setSaveLabel("Server load failed");
        throw error;
      }
    });

  const createVersion = (title: string, resume: Resume) =>
    runVersionAction("create the resume", async () => {
      const response = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, resume }),
      });
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "Unable to create the resume."),
        );
      }
      const created = normalizeResumeVersionSummary(await response.json());
      if (!created) {
        throw new Error("The server returned an invalid resume format.");
      }
      setVersions((current) => [...current, created]);
      savedRevisions.current[created.id] = 0;
      setActive({ id: created.id, title: created.title, resume, revision: 0 });
      writeStoredActiveId(created.id);
      setActiveSection("personal");
      setSaveLabel("Saved");
      setNoticeStatus(`"${created.title}" is ready to edit.`);
    });

  const renameVersion = async (title: string) => {
    if (!active) return false;
    let renamed = false;
    await runVersionAction("rename the resume", async () => {
      const response = await fetch(`/api/resumes/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "Unable to rename the resume."),
        );
      }
      setVersions((current) =>
        current.map((version) =>
          version.id === active.id ? { ...version, title } : version,
        ),
      );
      setActive((current) => (current ? { ...current, title } : current));
      renamed = true;
    });
    return renamed;
  };

  const deleteVersion = () => {
    if (!active) return;
    const deleting = active;
    void runVersionAction("delete the resume", async () => {
      const response = await fetch(`/api/resumes/${deleting.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "Unable to delete the resume."),
        );
      }
      const remaining = versions.filter((version) => version.id !== deleting.id);
      setVersions(remaining);
      delete savedRevisions.current[deleting.id];
      setSaveLabel("Loading resume...");
      await loadVersion(remaining[0].id);
      setSaveLabel("Restored from server");
      setNoticeStatus(`"${deleting.title}" was deleted.`);
    });
  };

  const resume = active?.resume ?? createBlankResume();

  const skills = resume.skills
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);

  return (
    <main className="app-shell">

      {/**
       * Left navigation bar
       * 
       */}
      <aside className="sidebar">
        <div className="nav-label">User&apos;s information</div>
        <nav className="section-nav">
          <AuthControl />
        </nav>
      
        <div className="nav-label">YOUR RESUME</div>
        <nav className="section-nav" aria-label="Resume sections">
          {sections.map((section) => (
            <button
              className={`nav-item ${activeSection === section.id ? "active" : ""}`}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              type="button"
            >
              <Icon
                name={
                  section.id === "personal"
                    ? "user"
                    : section.id === "experience"
                      ? "briefcase"
                      : section.id === "education"
                        ? "graduation"
                        : "tag"
                }
                size={17}
              />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="main-column">
        <ResumeHeader
          resume={resume}
          saveLabel={saveLabel}
          isImportingJson={isImportingJson}
          onJsonImport={(event) =>
            void handleJsonImport(event, {
              onImport: (imported) => {
                applyResume(() => imported);
                setSaveLabel("Imported JSON — saving...");
              },
              onError: setNoticeError,
              onStatus: setNoticeStatus,
              onImporting: setIsImportingJson,
            })
          }
          resumeSwitcher={
            <ResumeSwitcher
              versions={versions}
              activeId={active?.id ?? null}
              isBusy={isVersionBusy}
              onSelect={(id) => void openVersion(id)}
              onCreate={() =>
                void createVersion(`Resume ${versions.length + 1}`, createBlankResume())
              }
              onDuplicate={() => {
                if (active) {
                  void createVersion(createCopyTitle(active.title), active.resume);
                }
              }}
              onRename={renameVersion}
              onDelete={deleteVersion}
            />
          }
        />

        {(noticeError || noticeStatus) && (
          <div
            className={`import-message ${noticeError ? "has-error" : ""}`}
            role={noticeError ? "alert" : "status"}
          >
            <span>{noticeError || noticeStatus}</span>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => {
                setNoticeError("");
                setNoticeStatus("");
              }}
            >×</button>
          </div>
        )}

        <div className="mobile-section-nav">
          {sections.map((section) => (
            <button
              className={activeSection === section.id ? "active" : ""}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              type="button"
            >
              {section.label}
            </button>
          ))}
        </div>

        <div className="workspace">
          <section className="editor-panel">
            <div className="editor-heading">
              <div>
                <div className="eyebrow">LET&apos;S MAKE IT YOURS</div>
                <h1>
                  {sections.find((section) => section.id === activeSection)?.label}
                  <span className="heading-period">.</span>
                </h1>
                <p className="editor-intro">
                  {activeSection === "personal" &&
                    "Start with the essentials. Make it easy for the right people to reach you."}
                  {activeSection === "experience" &&
                    "Show the impact you've made, not just the work you've done."}
                  {activeSection === "education" &&
                    "Add the education and training that helped shape your career."}
                  {activeSection === "skills" &&
                    "Highlight the strengths that make you the right fit for your next role."}
                </p>
              </div>
              <span className="step-count">
                {sections.findIndex((section) => section.id === activeSection) + 1}
                <span> / 4</span>
              </span>
            </div>

            <div hidden={activeSection !== "personal"}>
              <PersonalInfoSection resume={resume} onUpdate={update} />
            </div>
            <div hidden={activeSection !== "experience"}>
              <ExperienceSection
                experience={resume.experience}
                onUpdate={update}
              />
            </div>
            <div hidden={activeSection !== "education"}>
              <EducationSection
                education={resume.education}
                onUpdate={update}
              />
            </div>
            <div hidden={activeSection !== "skills"}>
              <SkillsSection skills={resume.skills} onUpdate={update} />
            </div>

            <div className="editor-footer">
              <button
                type="button"
                className="back-button"
                disabled={activeSection === "personal"}
                onClick={() => {
                  const index = sections.findIndex((section) => section.id === activeSection);
                  setActiveSection(sections[Math.max(index - 1, 0)].id);
                }}
              >← <span>Back</span></button>
              <span className="footer-autosave"><span className="save-dot" /> Autosaved</span>
              {activeSection !== "education" ? (
                <button
                  type="button"
                  className="next-button"
                  onClick={() => {
                    const index = sections.findIndex((section) => section.id === activeSection);
                    setActiveSection(sections[Math.min(index + 1, sections.length - 1)].id);
                  }}
                >Continue <Icon name="arrow" size={16} /></button>
              ) : (
                <button type="button" className="next-button" onClick={() => window.print()}>
                  Finish resume <Icon name="check" size={16} />
                </button>
              )}
            </div>
          </section>

          <aside className="preview-panel">
            <div className="preview-header">
              <div>
                <span className="preview-kicker"><Icon name="eye" size={14} /> LIVE PREVIEW</span>
                <h2>Your resume</h2>
              </div>
              <span className="preview-page-count">1 page</span>
            </div>
            <fieldset className="template-picker">
              <legend>Choose a template</legend>
              <div className="template-options">
                {resumeTemplates.map((template) => (
                  <button
                    className={`template-card ${resume.template === template ? "selected" : ""}`}
                    key={template}
                    type="button"
                    aria-pressed={resume.template === template}
                    onClick={() => update("template", template)}
                  >
                    <span className={`template-swatch swatch-${template}`}>
                      <span /><span /><span />
                    </span>
                    <span className="template-card-copy">
                      <strong>{templateDetails[template].name}</strong>
                      <small>{templateDetails[template].description}</small>
                    </span>
                    {resume.template === template && (
                      <span className="template-selected"><Icon name="check" size={12} /></span>
                    )}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="paper-wrap">
              <article
                className={`resume-paper template-${resume.template}`}
                id="resume-preview"
              >
                <div className="resume-accent" />
                <header className="resume-header">
                  {resume.photo && (
                    // The photo is locally processed and validated as an image data URL.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="resume-photo" src={resume.photo} alt="" />
                  )}
                  <div className="resume-header-copy">
                    <h2>{resume.name || "Your Name"}</h2>
                    <p className="resume-role">{resume.role || "Your professional title"}</p>
                  <div className="resume-contact">
                    {[resume.email, resume.phone, resume.location, resume.website]
                      .filter(Boolean)
                      .map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
                  </div>
                  </div>
                </header>
                {resume.summary && (
                  <section className="resume-section">
                    <h3>Profile</h3>
                    <p>{resume.summary}</p>
                  </section>
                )}
                {skills.length > 0 && (
                  <section className="resume-section">
                    <h3>Skills</h3>
                    <div className="resume-skills">{skills.map((skill, index) => <span key={`${skill}-${index}`}>{skill}</span>)}</div>
                  </section>
                )}
                {resume.experience.length > 0 && (
                  <section className="resume-section">
                    <h3>Experience</h3>
                    {resume.experience.map((item, index) => (
                      <div className="resume-entry" key={`preview-experience-${index}`}>
                        <div className="resume-entry-top">
                          <strong>{item.role || "Position title"}</strong>
                          <span>{formatExperienceDates(item)}</span>
                        </div>
                        <div className="resume-entry-sub">{item.company || "Company name"}</div>
                        {item.description && <p>{item.description}</p>}
                      </div>
                    ))}
                  </section>
                )}
                {resume.education.length > 0 && (
                  <section className="resume-section">
                    <h3>Education</h3>
                    {resume.education.map((item, index) => (
                      <div className="resume-entry" key={`preview-education-${index}`}>
                        <div className="resume-entry-top">
                          <strong>{item.degree || "Degree or qualification"}</strong>
                          <span>{item.dates}</span>
                        </div>
                        <div className="resume-entry-sub">{item.school || "School or institution"}</div>
                      </div>
                    ))}
                  </section>
                )}
              </article>
            </div>
            <div className="preview-note"><span className="note-icon">i</span> Your resume updates as you edit. Nice and easy.</div>
          </aside>
        </div>
      </section>
    </main>
  );
}
