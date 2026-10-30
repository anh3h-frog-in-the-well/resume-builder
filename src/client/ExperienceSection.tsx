"use client";

import { useState } from "react";
import type {
  Experience,
  ExperienceField,
  Resume,
  ResumeUpdater,
} from "../interface/resume";
import Icon from "./Icon";
import ResumeField from "./ResumeField";

type ExperienceSectionProps = {
  experience: Resume["experience"];
  onUpdate: ResumeUpdater;
};

export default function ExperienceSection({
  experience,
  onUpdate,
}: ExperienceSectionProps) {
  const [polishingIndex, setPolishingIndex] = useState<number | null>(null);
  const [feedbackIndex, setFeedbackIndex] = useState<number | null>(null);
  const [polishError, setPolishError] = useState("");
  const [polishStatus, setPolishStatus] = useState("");

  const updateExperience = (
    index: number,
    key: ExperienceField,
    value: string,
  ) => {
    onUpdate(
      "experience",
      experience.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
            }
          : item,
      ),
    );
  };

  const updateExperienceList = (nextExperience: Experience[]) => {
    onUpdate("experience", nextExperience);
  };

  const handlePolishDescription = async (index: number) => {
    setPolishError("");
    setPolishStatus("");
    setFeedbackIndex(index);
    setPolishingIndex(index);
    try {
      const response = await fetch("/api/polish-experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: experience[index].description }),
      });
      const payload: unknown = await response.json();
      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("description" in payload) ||
        typeof payload.description !== "string"
      ) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to polish the description. Please try again.";
        throw new Error(message);
      }

      updateExperience(index, "description", payload.description);
      setPolishStatus(`Position ${index + 1} polished. Review before using.`);
    } catch (error) {
      console.error("Unable to polish the work experience description.", error);
      setPolishError(
        error instanceof Error
          ? error.message
          : "Unable to polish the description. Please try again.",
      );
    } finally {
      setPolishingIndex(null);
    }
  };

  return (
    <div className="form-section">
      <div className="form-section-title">
        <span className="section-icon"><Icon name="briefcase" size={17} /></span>
        <div><strong>Work experience</strong><span>Your most relevant roles, starting with the latest.</span></div>
      </div>
      <div className="repeat-list">
        {experience.map((item, index) => (
          <div className="repeat-card" key={`experience-${index}`}>
            <div className="repeat-card-heading">
              <span className="repeat-index">0{index + 1}</span>
              <strong>{item.role || `Position ${index + 1}`}</strong>
              <button
                type="button"
                aria-label={`Remove position ${index + 1}`}
                className="icon-button remove-button"
                disabled={polishingIndex !== null}
                onClick={() =>
                  updateExperienceList(
                    experience.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              ><Icon name="trash" size={16} /></button>
            </div>
            <div className="form-grid">
              <ResumeField label="Job title" value={item.role} onChange={(value) => updateExperience(index, "role", value)} placeholder="e.g. Product Designer" />
              <ResumeField label="Company" value={item.company} onChange={(value) => updateExperience(index, "company", value)} placeholder="e.g. Acme Inc." />
              <div
                className="experience-date-fields"
                style={{
                  display: "grid",
                  gridColumn: "1 / -1",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  alignItems: "start",
                  gap: 13,
                }}
              >
                <ResumeField
                  label="From"
                  value={item.from}
                  onChange={(value) => updateExperience(index, "from", value)}
                  type="month"
                />
                <ResumeField
                  label="To"
                  value={item.to}
                  onChange={(value) => updateExperience(index, "to", value)}
                  type="month"
                  hint="Leave blank if you still work here."
                />
              </div>
              <div className="full-width"><ResumeField label="What did you accomplish?" value={item.description} onChange={(value) => updateExperience(index, "description", value)} placeholder="Share your impact, outcomes, and the work you're proud of." multiline disabled={polishingIndex === index} /></div>
              <div className="full-width">
                <div className="summary-polish">
                  <button
                    className="summary-polish-button"
                    type="button"
                    disabled={
                      polishingIndex !== null || !item.description.trim()
                    }
                    onClick={() => void handlePolishDescription(index)}
                  >
                    <Icon name="spark" size={15} />
                    {polishingIndex === index
                      ? "Polishing..."
                      : "Polish with local AI"}
                  </button>
                  <span>
                    Uses your local Ollama server; your experience isn&apos;t
                    sent to a cloud AI.
                  </span>
                </div>
                {feedbackIndex === index && polishingIndex === index && (
                  <p className="summary-polish-message" role="status">
                    Polishing position {index + 1}...
                  </p>
                )}
                {feedbackIndex === index && polishError && (
                  <p className="summary-polish-message has-error" role="alert">
                    {polishError}
                  </p>
                )}
                {feedbackIndex === index && polishStatus && (
                  <p className="summary-polish-message" role="status">
                    {polishStatus}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        className="add-button"
        type="button"
        disabled={polishingIndex !== null}
        onClick={() =>
          updateExperienceList([
            ...experience,
            { company: "", role: "", from: "", to: "", description: "" },
          ])
        }
      ><Icon name="plus" size={17} /> Add experience</button>
    </div>
  );
}
