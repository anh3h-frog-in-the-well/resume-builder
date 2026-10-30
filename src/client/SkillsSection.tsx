"use client";

import type { Resume, ResumeUpdater } from "../interface/resume";
import Icon from "./Icon";
import ResumeField from "./ResumeField";

type SkillsSectionProps = {
  skills: Resume["skills"];
  onUpdate: ResumeUpdater;
};

export default function SkillsSection({
  skills,
  onUpdate,
}: SkillsSectionProps) {
  return (
    <div className="form-section">
      <div className="form-section-title">
        <span className="section-icon"><Icon name="tag" size={17} /></span>
        <div><strong>Skills &amp; strengths</strong><span>Make your expertise easy to scan at a glance.</span></div>
      </div>
      <ResumeField
        label="Your skills"
        value={skills}
        onChange={(value) => onUpdate("skills", value)}
        placeholder="e.g. Product strategy, Figma, User research"
        multiline
        hint="Separate each skill with a comma. You can update these anytime."
      />
    </div>
  );
}
