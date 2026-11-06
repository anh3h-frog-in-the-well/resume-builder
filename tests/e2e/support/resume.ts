import type { Resume } from "../../../src/interface/resume";

export function sampleResume(overrides: Partial<Resume> = {}): Resume {
  return {
    name: "Erin Example",
    role: "Senior Frontend Engineer",
    email: "erin@example.com",
    phone: "+49 170 000 0000",
    location: "Hamburg, Germany",
    website: "erin.example",
    summary:
      "Frontend engineer who enjoys turning fuzzy requirements into accessible, well-tested interfaces.",
    experience: [
      {
        company: "Northwind Labs",
        role: "Senior Frontend Engineer",
        from: "2021-04",
        to: "",
        description:
          "Lead the design-system effort and cut onboarding time for new engineers in half.",
      },
      {
        company: "Contoso",
        role: "Frontend Engineer",
        from: "2018-01",
        to: "2021-03",
        description: "Built the customer dashboard used by 40k monthly users.",
      },
    ],
    education: [
      {
        school: "Hamburg University of Technology",
        degree: "BSc Computer Science",
        dates: "2014 — 2018",
      },
    ],
    skills: "TypeScript, React, Accessibility, Testing",
    photo: "",
    template: "modern",
    ...overrides,
  };
}

/** A valid 1x1 PNG, small enough to inline in tests. */
export const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
