"use client";

import { useEffect, useState } from "react";
import Icon from "../client/Icon";
import AuthControl from "../client/AuthControl";
import EducationSection from "../client/EducationSection";
import ExperienceSection from "../client/ExperienceSection";
import PersonalInfoSection from "../client/PersonalInfoSection";
import ResumeHeader from "../client/ResumeHeader";
import SkillsSection from "../client/SkillsSection";
import type {
  ResumeSection,
  ResumeUpdater,
  TemplateDetails,
  Resume,
} from "../interface/resume";
import {
  normalizeResume,
  resumeTemplates,
} from "../util/resume-helper";
import { formatExperienceDates, handleJsonImport } from "../util/helper";

const initialResume: Resume = {
  name: "Max Mustermann",
  role: "Product Owner",
  email: "max.mustermann@test.com",
  phone: "+49 123 456 789",
  location: "Bonn, NRW",
  website: "musterman.test",
  summary:
    "Product designer with 6+ years of experience turning complex problems into clear, thoughtful digital experiences. I bring a user-first mindset, a love for collaboration, and a sharp eye for the details that make products feel effortless.",
  experience: [
    {
      company: "ABC",
      role: "Senior Product Designer",
      from: "2021-01",
      to: "",
      description:
        "Led end-to-end design for collaboration features used by 2M+ teams. Partnered with product and engineering to launch a new workflow that increased activation by 28%.",
    }
  ],
  education: [
    {
      school: "ABC school",
      degree: "Bachelor",
      dates: "2000 — 2004",
    },
  ],
  skills:
    "Product strategy, UX research, UI design, Prototyping, Design systems, Figma, Accessibility, Interaction design",
  photo: "",
  template: "modern",
};

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
  const [resume, setResume] = useState<Resume>(initialResume);
  const [activeSection, setActiveSection] = useState<ResumeSection>("personal");
  const [isReady, setIsReady] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Connecting to server...");
  const [importError, setImportError] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [isImportingJson, setIsImportingJson] = useState(false);

  useEffect(() => {
    const getDraftResume = async () => {
      try {
        const response = await fetch("/api/resume");
        if (response.status === 404) {
          setSaveLabel("New draft");
          setIsReady(true);
          return;
        }

        if (!response.ok) {
          throw new Error(`Database returned HTTP ${response.status}.`);
        }

        const parsed = normalizeResume(await response.json());
        if (!parsed) {
          throw new Error("The server returned an invalid resume format.");
        }

        setResume(parsed);
        setSaveLabel("Restored from server");
        setIsReady(true);
      } catch (error) {
        console.error("Unable to restore your resume from the server.", error);
        setSaveLabel("Server load failed");
      }
    };

    void getDraftResume();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const saveDraft = async () => {
      const serializedResume = JSON.stringify(resume);
      try {
        window.localStorage.setItem("draftly-resume", serializedResume);
      } catch (error) {
        console.error("Unable to save the browser backup.", error);
      }

      try {
        const response = await fetch("/api/resume", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: serializedResume,
        });
        if (!response.ok) {
          throw new Error(`Database returned HTTP ${response.status}.`);
        }
        setSaveLabel("Saved");
      } catch (error) {
        console.error("Unable to save your resume to Server.", error);
        setSaveLabel("Server save failed");
      }
    };

    const timeoutId = window.setTimeout(() => {
      void saveDraft();
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [isReady, resume]);

  const update: ResumeUpdater = (key, value) => {
    setSaveLabel("Unsaved changes");
    setResume((current) => ({ ...current, [key]: value }));
  };

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
        <div className="nav-label">User's information</div>
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
                setResume(imported);
                setSaveLabel("Imported JSON — saving...");
              },
              onError: setImportError,
              onStatus: setImportStatus,
              onImporting: setIsImportingJson,
            })
          }
        />

        {(importError || importStatus) && (
          <div
            className={`import-message ${importError ? "has-error" : ""}`}
            role={importError ? "alert" : "status"}
          >
            <span>{importError || importStatus}</span>
            <button
              type="button"
              aria-label="Dismiss import message"
              onClick={() => {
                setImportError("");
                setImportStatus("");
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
