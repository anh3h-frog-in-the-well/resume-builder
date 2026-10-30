"use client";

import { useState } from "react";
import type { Resume, ResumeUpdater } from "../interface/resume";
import ExperienceSection from "./ExperienceSection";

const initialExperience: Resume["experience"] = [
  {
    company: "Northstar",
    role: "Designer",
    from: "2021-01",
    to: "",
    description: "Led product design.",
  },
  {
    company: "Acme",
    role: "Associate Designer",
    from: "2019-01",
    to: "2021-01",
    description: "Created product interfaces.",
  },
];

export function Interactive() {
  const [resume, setResume] = useState<Resume>({
    name: "",
    role: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    summary: "",
    experience: initialExperience,
    education: [],
    skills: "",
    photo: "",
    template: "modern",
  });
  const onUpdate: ResumeUpdater = (key, value) => {
    setResume((current) => ({ ...current, [key]: value }));
  };

  return (
    <>
      <ExperienceSection experience={resume.experience} onUpdate={onUpdate} />
      <input
        data-testid="experience-value"
        type="hidden"
        value={JSON.stringify(resume.experience)}
        readOnly
      />
    </>
  );
}

export function Empty() {
  const [resume, setResume] = useState<Resume>({
    name: "",
    role: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    summary: "",
    experience: [],
    education: [],
    skills: "",
    photo: "",
    template: "modern",
  });
  const onUpdate: ResumeUpdater = (key, value) => {
    setResume((current) => ({ ...current, [key]: value }));
  };

  return <ExperienceSection experience={resume.experience} onUpdate={onUpdate} />;
}
