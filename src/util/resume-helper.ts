import type {
  Education,
  Experience,
  Resume,
  ResumeBase,
  ResumeTemplate,
} from "../interface/resume";

export const resumeTemplates = [
  "modern",
  "classic",
  "creative",
] as const satisfies readonly ResumeTemplate[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= 10_000;
}

function isPhoto(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 600_000 &&
    (value === "" ||
      /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        value,
      ))
  );
}

function isExperience(
  value: unknown,
): value is Experience  {
  const validDate = (date: unknown) =>
    typeof date === "string" &&
    (date === "" || /^\d{4}-(0[1-9]|1[0-2])$/.test(date));

  return (
    isRecord(value) &&
    isText(value.company) &&
    isText(value.role) &&
    isText(value.description) &&
    (("from" in value &&
      validDate(value.from) &&
      validDate(value.to)) ||
      (isText(value.dates) &&
        (value.from === undefined || validDate(value.from)) &&
        (value.to === undefined || validDate(value.to))))
  );
}

function isEducation(value: unknown): value is Education {
  return (
    isRecord(value) &&
    isText(value.school) &&
    isText(value.degree) &&
    isText(value.dates)
  );
}

function isResumeBase(
  value: Record<string, unknown>,
): value is ResumeBase {
  return (
    isText(value.name) &&
    isText(value.role) &&
    isText(value.email) &&
    isText(value.phone) &&
    isText(value.location) &&
    isText(value.website) &&
    isText(value.summary) &&
    isText(value.skills) &&
    Array.isArray(value.experience) &&
    value.experience.length <= 50 &&
    value.experience.every(isExperience) &&
    Array.isArray(value.education) &&
    value.education.length <= 50 &&
    value.education.every(isEducation)
  );
}

export function normalizeResume(value: unknown): Resume | null {
  if (!isRecord(value) || !isResumeBase(value)) return null;
  if (value.photo !== undefined && !isPhoto(value.photo)) return null;
  if (
    value.template !== undefined &&
    (typeof value.template !== "string" ||
      !resumeTemplates.some((template) => template === value.template))
  ) {
    return null;
  }

  return {
    name: value.name,
    role: value.role,
    email: value.email,
    phone: value.phone,
    location: value.location,
    website: value.website,
    summary: value.summary,
    experience: value.experience.map((entry) => {
      if ("dates" in entry) {
        return {
          company: entry.company,
          role: entry.role,
          from: "",
          to: "",
          description: entry.description,
        };
      }
      return {
        company: entry.company,
        role: entry.role,
        from: entry.from,
        to: entry.to,
        description: entry.description,
      };
    }),
    education: value.education,
    skills: value.skills,
    photo: typeof value.photo === "string" ? value.photo : "",
    template: resumeTemplates.find(
      (template) => template === value.template,
    ) ?? "modern",
  };
}
