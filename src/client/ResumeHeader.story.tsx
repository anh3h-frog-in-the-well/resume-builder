"use client";

import { useState, type ChangeEvent } from "react";
import type { Resume } from "../interface/resume";
import ResumeHeader from "./ResumeHeader";

const resume: Resume = {
  name: "Alex Morgan",
  role: "Product Designer",
  email: "alex@example.com",
  phone: "555-0100",
  location: "San Francisco",
  website: "alex.example.com",
  summary: "Experienced designer.",
  experience: [],
  education: [],
  skills: "Design, Research",
  photo: "",
  template: "modern",
};

export function Interactive() {
  const [importedFile, setImportedFile] = useState("");
  const onJsonImport = (event: ChangeEvent<HTMLInputElement>) => {
    setImportedFile(event.currentTarget.files?.[0]?.name ?? "");
  };

  return (
    <>
      <ResumeHeader
        resume={resume}
        saveLabel="Saved to MySQL"
        isImportingJson={false}
        onJsonImport={onJsonImport}
      />
      <output data-testid="imported-file">{importedFile}</output>
    </>
  );
}
