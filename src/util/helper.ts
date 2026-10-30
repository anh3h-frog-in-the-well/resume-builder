import {
  createElement,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type { Experience, Resume, ResumeTemplate } from "../interface/resume";
import { normalizeResume } from "./resume-helper";

export type IconPathMap = Record<string, ReactNode>;

const path = (d: string) => createElement("path", { d });
const circle = (cx: number, cy: number, r: number) =>
  createElement("circle", { cx, cy, r });
const rect = (x: number, y: number, width: number, height: number, rx: number) =>
  createElement("rect", { x, y, width, height, rx });
const group = (...children: ReactNode[]) => createElement("g", null, ...children);

export const iconPaths: IconPathMap = {
  spark: group(
    path("m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"),
    path("m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z"),
  ),
  user: group(
    circle(12, 8, 3.5),
    path("M5 20c.7-3.1 3.1-5 7-5s6.3 1.9 7 5"),
  ),
  briefcase: group(
    rect(3, 7, 18, 13, 2),
    path("M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2"),
  ),
  graduation: group(
    path("m2 10 10-6 10 6-10 6-10-6Z"),
    path("M6 12v5c3.5 3 8.5 3 12 0v-5m4-2v7"),
  ),
  tag: group(
    path("M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1 0-2.8l7.2-7.2A2 2 0 0 1 12 3h6a2 2 0 0 1 2 2v6a2 2 0 0 1 .6 2.4Z"),
    circle(16.5, 7.5, 1),
  ),
  download: path("M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"),
  plus: path("M12 5v14m-7-7h14"),
  trash: path("M4 7h16m-10 4v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"),
  check: path("m5 12 4 4L19 6"),
  arrow: path("M5 12h14m-6-6 6 6-6 6"),
  file: group(
    path("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"),
    path("M14 2v6h6M8 13h8m-8 4h8"),
  ),
  eye: group(
    path("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"),
    circle(12, 12, 3),
  ),
  language: path("m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802"),
};

function formatMonth(value: string) {
  if (!value) return "";
  const [year, month] = value.split("-");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
}

export function formatExperienceDates(item: Experience) {
  if (!item.from && !item.to) return "";
  const from = item.from ? formatMonth(item.from) : "";
  const to = item.to ? formatMonth(item.to) : item.from ? "Present" : "";
  return [from, to].filter(Boolean).join(" — ");
}

type JsonImportCallbacks = {
  onImport: (resume: Resume) => void;
  onError: (message: string) => void;
  onStatus: (message: string) => void;
  onImporting: (isImporting: boolean) => void;
};

export async function handleJsonImport(
  event: ChangeEvent<HTMLInputElement>,
  { onImport, onError, onStatus, onImporting }: JsonImportCallbacks,
) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;

  onError("");
  onStatus("");
  if (!file.name.toLowerCase().endsWith(".json")) {
    onError("Choose a JSON file.");
    input.value = "";
    return;
  }
  if (file.size > 1_000_000) {
    onError("Choose a JSON file smaller than 1 MB.");
    input.value = "";
    return;
  }

  onImporting(true);
  try {
    const parsed: unknown = JSON.parse(await file.text());
    let resumeData = parsed;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      "format" in parsed
    ) {
      if (
        parsed.format !== "draftly-resume" ||
        !("version" in parsed) ||
        parsed.version !== 1 ||
        !("resume" in parsed)
      ) {
        throw new Error("This Draftly JSON file has an unsupported format.");
      }
      resumeData = parsed.resume;
    }

    const imported = normalizeResume(resumeData);
    if (!imported) {
      throw new Error("This JSON file does not contain valid resume data.");
    }

    onImport(imported);
    onStatus(
      "Resume imported. Review the details; your changes are being saved.",
    );
  } catch (error) {
    console.error("Unable to import resume JSON.", error);
    onError(
      error instanceof Error ? error.message : "Unable to read this JSON file.",
    );
  } finally {
    onImporting(false);
    input.value = "";
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function downloadWord(resume: Resume) {
  const safe = (value: string) => escapeHtml(value);
  const templateStyles: Record<ResumeTemplate, string> = {
    modern:
      ".resume-header h1{color:#263142}.resume-role{color:#5066df}.resume-section h2{color:#5a6ac2;border-bottom:1px solid #e6e9ee}.resume-accent{background:#6173df}",
    classic:
      ".resume{font-family:Georgia,serif}.resume-header{text-align:center}.resume-header h1{font-family:Georgia,serif;color:#253449}.resume-role{color:#506078}.resume-section h2{color:#334155;border-color:#aeb7c4}.resume-accent{background:#334155}.resume-photo{border-radius:50%}",
    creative:
      ".resume{background:#fffdfb}.resume-header{background:#fff5ef;padding:18px}.resume-header h1{color:#543d38}.resume-role{color:#c66548}.resume-section h2{color:#bf6245;border-color:#eed4c8}.resume-accent{background:#d86f50}.resume-photo{border-radius:50%}.resume-skill{background:#fff0e9}",
  };
  const skills = resume.skills
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
  const experience = resume.experience
    .map(
      (item) => `
        <div style="margin:0 0 18px">
          <table style="width:100%;border-collapse:collapse"><tr>
            <td><strong>${safe(item.role)}</strong><br><span>${safe(item.company)}</span></td>
            <td style="text-align:right;color:#697386">${safe(formatExperienceDates(item))}</td>
          </tr></table>
          <p style="line-height:1.55;margin:7px 0 0">${safe(item.description)}</p>
        </div>`,
    )
    .join("");
  const education = resume.education
    .map(
      (item) => `
        <div style="margin:0 0 14px">
          <table style="width:100%;border-collapse:collapse"><tr>
            <td><strong>${safe(item.degree)}</strong><br><span>${safe(item.school)}</span></td>
            <td style="text-align:right;color:#697386">${safe(item.dates)}</td>
          </tr></table>
        </div>`,
    )
    .join("");
  const photo = resume.photo
    ? `<img class="resume-photo" src="${safe(resume.photo)}" alt="" style="float:right;width:82px;height:82px;object-fit:cover;margin:0 0 12px 18px">`
    : "";
  const html = `
    <!doctype html><html><head><meta charset="utf-8"><title>${safe(resume.name)} - Resume</title>
    <style>.resume{font-family:Arial,sans-serif;color:#202a38;max-width:760px;margin:48px auto;line-height:1.45}.resume-header{min-height:92px;padding-bottom:18px;border-bottom:1px solid #dce1e9}.resume-header h1{font-size:32px;margin:0 0 3px}.resume-role{font-size:17px;margin:0 0 10px}.resume-section{clear:both;margin-top:25px}.resume-section h2{font-size:13px;letter-spacing:1px;padding-bottom:7px}.resume-skill{display:inline-block;margin:3px;padding:5px 7px;background:#f3f4f8;border-radius:3px}</style>
    <style>${templateStyles[resume.template]}</style></head>
    <body><main class="resume ${resume.template}">
      ${photo}
      <header class="resume-header">
      <h1>${safe(resume.name)}</h1>
      <p class="resume-role">${safe(resume.role)}</p>
      <p style="font-size:12px;color:#667085;margin:0 0 28px">${[resume.email, resume.phone, resume.location, resume.website].filter(Boolean).map(safe).join(" &nbsp;·&nbsp; ")}</p>
      </header>
      <section class="resume-section"><h2>PROFILE</h2>
      <p style="line-height:1.6">${safe(resume.summary)}</p>
      </section><section class="resume-section"><h2>SKILLS</h2>
      <p>${skills.map((skill) => `<span class="resume-skill">${safe(skill)}</span>`).join("")}</p>
      </section><section class="resume-section"><h2>EXPERIENCE</h2>
      ${experience}
      </section><section class="resume-section"><h2>EDUCATION</h2>
      ${education}
      </section></main></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resume.name.trim() || "resume"}-resume.doc`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(resume: Resume) {
  const data = {
    format: "draftly-resume",
    version: 1,
    resume,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resume.name.trim() || "resume"}-resume.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
