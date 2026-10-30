"use client";

import { useState } from "react";
import type { Resume, ResumeUpdater } from "../interface/resume";
import PersonalInfoSection from "./PersonalInfoSection";

const initialResume: Resume = {
  name: "Alex Morgan",
  role: "Product Designer",
  email: "alex@example.com",
  phone: "555-0100",
  location: "San Francisco",
  website: "alex.example.com",
  summary: "Experienced designer.",
  experience: [],
  education: [],
  skills: "",
  photo: "",
  template: "modern",
};

export function Interactive() {
  const [resume, setResume] = useState(initialResume);
  const onUpdate: ResumeUpdater = (key, value) => {
    setResume((current) => ({ ...current, [key]: value }));
  };

  return <PersonalInfoSection resume={resume} onUpdate={onUpdate} />;
}
