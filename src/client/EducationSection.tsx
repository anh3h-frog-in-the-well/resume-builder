"use client";

import type { Education, Resume, ResumeUpdater } from "../interface/resume";
import Icon from "./Icon";
import ResumeField from "./ResumeField";

type EducationSectionProps = {
  education: Resume["education"];
  onUpdate: ResumeUpdater;
};

export default function EducationSection({
  education,
  onUpdate,
}: EducationSectionProps) {
  const updateEducation = (
    index: number,
    key: keyof Education,
    value: string,
  ) => {
    onUpdate(
      "education",
      education.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const updateEducationList = (nextEducation: Education[]) => {
    onUpdate("education", nextEducation);
  };

  return (
    <div className="form-section">
      <div className="form-section-title">
        <span className="section-icon"><Icon name="graduation" size={17} /></span>
        <div><strong>Education</strong><span>Include degrees, certifications, and relevant training.</span></div>
      </div>
      <div className="repeat-list">
        {education.map((item, index) => (
          <div className="repeat-card" key={`education-${index}`}>
            <div className="repeat-card-heading">
              <span className="repeat-index">0{index + 1}</span>
              <strong>{item.school || `Education ${index + 1}`}</strong>
              <button
                type="button"
                aria-label={`Remove education ${index + 1}`}
                className="icon-button remove-button"
                onClick={() =>
                  updateEducationList(
                    education.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              ><Icon name="trash" size={16} /></button>
            </div>
            <div className="form-grid">
              <ResumeField label="School or institution" value={item.school} onChange={(value) => updateEducation(index, "school", value)} placeholder="e.g. State University" />
              <ResumeField label="Degree or qualification" value={item.degree} onChange={(value) => updateEducation(index, "degree", value)} placeholder="e.g. BA, Graphic Design" />
              <div className="full-width"><ResumeField label="Dates" value={item.dates} onChange={(value) => updateEducation(index, "dates", value)} placeholder="e.g. 2018 — 2022" /></div>
            </div>
          </div>
        ))}
      </div>
      <button
        className="add-button"
        type="button"
        onClick={() =>
          updateEducationList([
            ...education,
            { school: "", degree: "", dates: "" },
          ])
        }
      ><Icon name="plus" size={17} /> Add education</button>
    </div>
  );
}
