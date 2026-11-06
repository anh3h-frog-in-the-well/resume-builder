import { describe, expect, it } from "vitest";
import type { Resume } from "../../../src/interface/resume";
import {
  createBlankResume,
  createCopyTitle,
  createSampleResume,
  defaultResumeTitle,
  isResumeVersionId,
  maxResumeTitleLength,
  maxResumeVersions,
  normalizeResume,
  normalizeResumeTitle,
  normalizeResumeVersion,
  normalizeResumeVersionList,
  normalizeResumeVersionSummary,
  resumeTemplates,
} from "../../../src/util/resume-helper";
import {
  createEducation,
  createExperience,
  createResume,
  tinyJpegDataUrl,
} from "../fixtures/resume";

describe("resumeTemplates", () => {
  it("lists the supported templates in display order", () => {
    expect(resumeTemplates).toEqual(["modern", "classic", "creative"]);
  });
});

describe("normalizeResume", () => {
  it("returns a clean copy of a valid resume", () => {
    const resume = createResume({ photo: tinyJpegDataUrl, template: "classic" });

    const normalized = normalizeResume(resume);

    expect(normalized).toEqual(resume);
    expect(normalized).not.toBe(resume);
  });

  it("defaults photo and template when they are missing", () => {
    const base: Partial<Resume> = createResume();
    delete base.photo;
    delete base.template;

    expect(normalizeResume(base)).toMatchObject({ photo: "", template: "modern" });
  });

  it("accepts legacy experience entries that only have a dates string", () => {
    const normalized = normalizeResume(
      createResume({
        experience: [
          {
            company: "Legacy Co",
            role: "Engineer",
            description: "Built things.",
            dates: "2010 — 2012",
          } as unknown as ReturnType<typeof createExperience>,
        ],
      }),
    );

    expect(normalized?.experience).toEqual([
      { company: "Legacy Co", role: "Engineer", from: "", to: "", description: "Built things." },
    ]);
  });

  it("accepts legacy entries that mix dates with valid from/to months", () => {
    const normalized = normalizeResume(
      createResume({
        experience: [
          {
            company: "Legacy Co",
            role: "Engineer",
            description: "Built things.",
            dates: "2010 — 2012",
            from: "2010-01",
            to: "",
          } as unknown as ReturnType<typeof createExperience>,
        ],
      }),
    );

    // The presence of `dates` makes the entry a legacy entry, so months reset.
    expect(normalized?.experience[0]).toMatchObject({ from: "", to: "" });
  });

  it("strips unknown top-level properties", () => {
    const normalized = normalizeResume({ ...createResume(), extra: "ignored" });

    expect(normalized).not.toHaveProperty("extra");
  });

  it.each([
    ["null", null],
    ["a string", "resume"],
    ["an array", [createResume()]],
    ["an empty object", {}],
  ])("rejects %s", (_label, value) => {
    expect(normalizeResume(value)).toBeNull();
  });

  it.each([
    "name",
    "role",
    "email",
    "phone",
    "location",
    "website",
    "summary",
    "skills",
  ] as const)("rejects a non-string %s", (key) => {
    expect(normalizeResume({ ...createResume(), [key]: 1 })).toBeNull();
    expect(normalizeResume({ ...createResume(), [key]: undefined })).toBeNull();
  });

  it("rejects text fields longer than 10,000 characters", () => {
    expect(
      normalizeResume(createResume({ summary: "x".repeat(10_001) })),
    ).toBeNull();
    expect(
      normalizeResume(createResume({ summary: "x".repeat(10_000) })),
    ).not.toBeNull();
  });

  it("rejects invalid experience entries", () => {
    const invalidEntries = [
      { ...createExperience(), from: "2021-13" },
      { ...createExperience(), to: "March 2021" },
      { ...createExperience(), company: 3 },
      { ...createExperience(), description: undefined },
      { company: "A", role: "B", description: "C" },
      "not an object",
    ];

    for (const entry of invalidEntries) {
      expect(
        normalizeResume({ ...createResume(), experience: [entry] }),
        JSON.stringify(entry),
      ).toBeNull();
    }
  });

  it("allows empty month values", () => {
    const normalized = normalizeResume(
      createResume({ experience: [createExperience({ from: "", to: "" })] }),
    );

    expect(normalized?.experience[0]).toMatchObject({ from: "", to: "" });
  });

  it("rejects invalid education entries", () => {
    expect(
      normalizeResume(
        createResume({
          education: [{ ...createEducation(), dates: null } as never],
        }),
      ),
    ).toBeNull();
    expect(
      normalizeResume({ ...createResume(), education: "none" }),
    ).toBeNull();
  });

  it("caps experience and education at 50 entries", () => {
    const tooManyExperience = Array.from({ length: 51 }, () => createExperience());
    const tooManyEducation = Array.from({ length: 51 }, () => createEducation());

    expect(
      normalizeResume(createResume({ experience: tooManyExperience })),
    ).toBeNull();
    expect(
      normalizeResume(createResume({ education: tooManyEducation })),
    ).toBeNull();
    expect(
      normalizeResume(createResume({ experience: tooManyExperience.slice(0, 50) })),
    ).not.toBeNull();
  });

  it("rejects photos that are not inline JPEG, PNG or WebP images", () => {
    expect(normalizeResume(createResume({ photo: "https://example.com/a.jpg" }))).toBeNull();
    expect(
      normalizeResume(createResume({ photo: "data:image/gif;base64,R0lGOD" })),
    ).toBeNull();
    expect(
      normalizeResume(createResume({ photo: "data:image/png;base64,not base64!" })),
    ).toBeNull();
    expect(normalizeResume({ ...createResume(), photo: 42 })).toBeNull();
  });

  it("rejects photos above the size limit", () => {
    const oversized = `data:image/png;base64,${"A".repeat(600_000)}`;

    expect(normalizeResume(createResume({ photo: oversized }))).toBeNull();
  });

  it("accepts PNG and WebP photos", () => {
    expect(
      normalizeResume(createResume({ photo: "data:image/png;base64,AAAA" })),
    ).not.toBeNull();
    expect(
      normalizeResume(createResume({ photo: "data:image/webp;base64,AAAA==" })),
    ).not.toBeNull();
  });

  it("rejects unknown templates", () => {
    expect(normalizeResume({ ...createResume(), template: "bold" })).toBeNull();
    expect(normalizeResume({ ...createResume(), template: 1 })).toBeNull();
  });
});

describe("sample and blank resumes", () => {
  it("provides a valid sample resume with fresh copies", () => {
    const sample = createSampleResume();

    expect(normalizeResume(sample)).toEqual(sample);
    expect(sample.name).toBe("Max Mustermann");
    expect(createSampleResume()).not.toBe(sample);
  });

  it("provides a valid blank resume", () => {
    const blank = createBlankResume();

    expect(normalizeResume(blank)).toEqual(blank);
    expect(blank).toMatchObject({ name: "", experience: [], education: [], template: "modern" });
  });

  it("exposes the version limits", () => {
    expect(maxResumeVersions).toBe(10);
    expect(maxResumeTitleLength).toBe(80);
    expect(defaultResumeTitle).toBe("My resume");
  });
});

describe("normalizeResumeTitle", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeResumeTitle("  Frontend \n  roles  ")).toBe("Frontend roles");
  });

  it.each([
    ["a non-string", 42],
    ["an empty string", ""],
    ["whitespace only", " \t "],
    ["an over-long title", "x".repeat(81)],
  ])("rejects %s", (_label, value) => {
    expect(normalizeResumeTitle(value)).toBeNull();
  });

  it("accepts a title at the limit", () => {
    expect(normalizeResumeTitle("x".repeat(80))).toBe("x".repeat(80));
  });
});

describe("createCopyTitle", () => {
  it("appends a copy suffix", () => {
    expect(createCopyTitle("General")).toBe("General (copy)");
  });

  it("keeps the result within the title limit", () => {
    const copy = createCopyTitle("x".repeat(80));

    expect(copy).toHaveLength(80);
    expect(copy.endsWith(" (copy)")).toBe(true);
  });
});

describe("isResumeVersionId", () => {
  it("accepts UUIDs only", () => {
    expect(isResumeVersionId("3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b")).toBe(true);
    expect(isResumeVersionId("3F2A9C1E-5B7D-4E8F-9A0B-1C2D3E4F5A6B")).toBe(true);
    expect(isResumeVersionId("not-an-id")).toBe(false);
    expect(isResumeVersionId("../etc/passwd")).toBe(false);
    expect(isResumeVersionId(12)).toBe(false);
  });
});

describe("resume version payloads", () => {
  const id = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
  const summary = { id, title: "  General ", updatedAt: "2024-01-01T00:00:00.000Z" };

  it("normalizes a summary", () => {
    expect(normalizeResumeVersionSummary(summary)).toEqual({ ...summary, title: "General" });
  });

  it.each([
    ["a bad id", { ...summary, id: "nope" }],
    ["a blank title", { ...summary, title: " " }],
    ["a missing date", { id, title: "x" }],
    ["a non-object", "summary"],
  ])("rejects a summary with %s", (_label, value) => {
    expect(normalizeResumeVersionSummary(value)).toBeNull();
  });

  it("normalizes a list", () => {
    expect(normalizeResumeVersionList({ resumes: [summary] })).toEqual([
      { ...summary, title: "General" },
    ]);
    expect(normalizeResumeVersionList({ resumes: [] })).toEqual([]);
  });

  it("rejects lists with invalid entries or the wrong shape", () => {
    expect(normalizeResumeVersionList({ resumes: [summary, { id }] })).toBeNull();
    expect(normalizeResumeVersionList({ resumes: "none" })).toBeNull();
    expect(normalizeResumeVersionList([summary])).toBeNull();
  });

  it("normalizes a version with its resume", () => {
    const resume = createResume();

    expect(normalizeResumeVersion({ ...summary, resume })).toEqual({
      ...summary,
      title: "General",
      resume,
    });
  });

  it("rejects a version with an invalid resume or summary", () => {
    expect(normalizeResumeVersion({ ...summary, resume: { name: "x" } })).toBeNull();
    expect(normalizeResumeVersion({ ...summary, id: "nope", resume: createResume() })).toBeNull();
    expect(normalizeResumeVersion(null)).toBeNull();
  });
});
