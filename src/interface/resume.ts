export type Experience = {
  company: string;
  role: string;
  from: string;
  to: string;
  description: string;
};

export type Education = {
  school: string;
  degree: string;
  dates: string;
};

export type ResumeTemplate = "modern" | "classic" | "creative";

export type Resume = {
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: string;
  photo: string;
  template: ResumeTemplate;
};

export type ResumeBase = Record<string, unknown> & {
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: string;
};

export type ResumeSection= "personal" | "skills" | "experience" | "education";

/** A saved resume version as listed in the switcher. */
export type ResumeVersionSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

/** A saved resume version together with its content. */
export type ResumeVersion = ResumeVersionSummary & {
  resume: Resume;
};

export type TemplateDetails = Record<
  ResumeTemplate,
  { name: string; description: string }
>;

export type IconProps = {
  name: string;
  size?: number;
};

export type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  disabled?: boolean;
  hint?: string;
};

export type ExperienceField =
  | "company"
  | "role"
  | "from"
  | "to"
  | "description";

export type ResumeUpdater = <K extends keyof Resume>(
  key: K,
  value: Resume[K],
) => void;
