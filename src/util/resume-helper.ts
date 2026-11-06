import type {
  Education,
  Experience,
  Resume,
  ResumeBase,
  ResumeTemplate,
  ResumeVersion,
  ResumeVersionSummary,
} from "../interface/resume";

export const resumeTemplates = [
  "modern",
  "classic",
  "creative",
] as const satisfies readonly ResumeTemplate[];

/** How many resume versions one account may keep. */
export const maxResumeVersions = 10;

/** Maximum length of a resume version title, after trimming. */
export const maxResumeTitleLength = 80;

/** Title given to the first resume of an account. */
export const defaultResumeTitle = "My resume";

/** The sample content shown to a brand-new account. */
export function createSampleResume(): Resume {
  return {
    name: "Max Mustermann",
    role: "Product Owner",
    email: "muster.mann@email.com",
    phone: "+49 123 456 789",
    location: "Bonn, NRW",
    website: "musterman.design",
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
      },
    ],
    education: [
      {
        school: "ABC Univerisity",
        degree: "Bachelor of Engineering",
        dates: "2014 — 2018",
      },
    ],
    skills:
      "Product strategy, UX research, UI design, Prototyping, Design systems, Figma, Accessibility, Interaction design",
    photo: "",
    template: "modern",
  };
}

/** An empty resume for a freshly created version. */
export function createBlankResume(): Resume {
  return {
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
  };
}

/**
 * Trims and collapses whitespace in a version title. Returns null when the
 * value is not a usable title.
 */
export function normalizeResumeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.replace(/\s+/g, " ").trim();
  if (!title || title.length > maxResumeTitleLength) return null;
  return title;
}

/** Builds the title for a copy, keeping it within the length limit. */
export function createCopyTitle(title: string) {
  const suffix = " (copy)";
  return `${title.slice(0, maxResumeTitleLength - suffix.length).trimEnd()}${suffix}`;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isResumeVersionId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function normalizeResumeVersionSummary(
  value: unknown,
): ResumeVersionSummary | null {
  if (!isRecord(value) || !isResumeVersionId(value.id)) return null;
  const title = normalizeResumeTitle(value.title);
  if (!title || typeof value.updatedAt !== "string") return null;
  return { id: value.id, title, updatedAt: value.updatedAt };
}

export function normalizeResumeVersionList(
  value: unknown,
): ResumeVersionSummary[] | null {
  if (!isRecord(value) || !Array.isArray(value.resumes)) return null;
  const resumes = value.resumes.map(normalizeResumeVersionSummary);
  return resumes.every((entry) => entry !== null) ? resumes : null;
}

export function normalizeResumeVersion(value: unknown): ResumeVersion | null {
  const summary = normalizeResumeVersionSummary(value);
  if (!summary || !isRecord(value)) return null;
  const resume = normalizeResume(value.resume);
  return resume ? { ...summary, resume } : null;
}

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
      validDate((value.to as string).trim())) ||
      (isText(value.dates) &&
        (value.from === undefined || validDate(value.from)) &&
        (value.to === undefined || validDate((value.to as string).trim()))))
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
