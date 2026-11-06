import type { Education, Experience, Resume } from "../../../src/interface/resume";

export function createExperience(
  overrides: Partial<Experience> = {},
): Experience {
  return {
    company: "Acme Inc.",
    role: "Product Designer",
    from: "2021-03",
    to: "2023-08",
    description: "Designed and shipped the onboarding flow.",
    ...overrides,
  };
}

export function createEducation(
  overrides: Partial<Education> = {},
): Education {
  return {
    school: "State University",
    degree: "BA, Graphic Design",
    dates: "2014 — 2018",
    ...overrides,
  };
}

export function createResume(overrides: Partial<Resume> = {}): Resume {
  return {
    name: "Alex Morgan",
    role: "Product Designer",
    email: "alex@example.com",
    phone: "+1 555 000 0000",
    location: "Berlin, Germany",
    website: "alexmorgan.design",
    summary: "Product designer with a love for clear interfaces.",
    experience: [createExperience()],
    education: [createEducation()],
    skills: "Figma, Prototyping, User research",
    photo: "",
    template: "modern",
    ...overrides,
  };
}

export const tinyJpegDataUrl =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
