import type { ChangeEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadJson,
  downloadWord,
  formatExperienceDates,
  handleJsonImport,
  iconPaths,
} from "../../../src/util/helper";
import { createExperience, createResume } from "../fixtures/resume";

describe("iconPaths", () => {
  it("defines every icon used by the UI", () => {
    expect(Object.keys(iconPaths).sort()).toEqual(
      [
        "arrow",
        "briefcase",
        "check",
        "download",
        "eye",
        "file",
        "graduation",
        "plus",
        "spark",
        "tag",
        "trash",
        "user",
      ].sort(),
    );
  });
});

describe("formatExperienceDates", () => {
  it("returns an empty string when no dates are set", () => {
    expect(formatExperienceDates(createExperience({ from: "", to: "" }))).toBe("");
  });

  it("formats a full date range", () => {
    expect(
      formatExperienceDates(createExperience({ from: "2021-03", to: "2023-12" })),
    ).toBe("Mar 2021 — Dec 2023");
  });

  it("marks an open-ended role as present", () => {
    expect(
      formatExperienceDates(createExperience({ from: "2019-01", to: "" })),
    ).toBe("Jan 2019 — Present");
  });

  it("shows only the end date when the start is missing", () => {
    expect(
      formatExperienceDates(createExperience({ from: "", to: "2020-07" })),
    ).toBe("Jul 2020");
  });
});

type ImportCallbacks = {
  [K in keyof Parameters<typeof handleJsonImport>[1]]: ReturnType<
    typeof vi.fn<Parameters<typeof handleJsonImport>[1][K]>
  >;
};

function createImportEvent(file?: File) {
  const input = document.createElement("input");
  input.type = "file";
  Object.defineProperty(input, "files", {
    configurable: true,
    value: file ? [file] : [],
  });
  Object.defineProperty(input, "value", {
    configurable: true,
    writable: true,
    value: file ? `C:\\fakepath\\${file.name}` : "",
  });
  return {
    input,
    event: { currentTarget: input } as unknown as ChangeEvent<HTMLInputElement>,
  };
}

function createCallbacks(): ImportCallbacks {
  return {
    onImport: vi.fn(),
    onError: vi.fn(),
    onStatus: vi.fn(),
    onImporting: vi.fn(),
  };
}

function jsonFile(contents: unknown, name = "resume.json") {
  const text = typeof contents === "string" ? contents : JSON.stringify(contents);
  return new File([text], name, { type: "application/json" });
}

describe("handleJsonImport", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does nothing when no file was chosen", async () => {
    const callbacks = createCallbacks();
    const { event } = createImportEvent();

    await handleJsonImport(event, callbacks);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onImporting).not.toHaveBeenCalled();
  });

  it("rejects files without a .json extension", async () => {
    const callbacks = createCallbacks();
    const { event, input } = createImportEvent(jsonFile("{}", "resume.txt"));

    await handleJsonImport(event, callbacks);

    expect(callbacks.onError).toHaveBeenLastCalledWith("Choose a JSON file.");
    expect(callbacks.onImporting).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("rejects files larger than 1 MB", async () => {
    const callbacks = createCallbacks();
    const file = jsonFile("{}");
    Object.defineProperty(file, "size", { value: 1_000_001 });
    const { event, input } = createImportEvent(file);

    await handleJsonImport(event, callbacks);

    expect(callbacks.onError).toHaveBeenLastCalledWith(
      "Choose a JSON file smaller than 1 MB.",
    );
    expect(input.value).toBe("");
  });

  it("imports a bare resume object", async () => {
    const callbacks = createCallbacks();
    const resume = createResume();
    const { event, input } = createImportEvent(jsonFile(resume));

    await handleJsonImport(event, callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith("");
    expect(callbacks.onStatus).toHaveBeenCalledWith("");
    expect(callbacks.onImporting.mock.calls).toEqual([[true], [false]]);
    expect(callbacks.onImport).toHaveBeenCalledWith(resume);
    expect(callbacks.onStatus).toHaveBeenLastCalledWith(
      "Resume imported. Review the details; your changes are being saved.",
    );
    expect(input.value).toBe("");
  });

  it("imports the wrapped draftly-resume export format", async () => {
    const callbacks = createCallbacks();
    const resume = createResume({ name: "Wrapped" });
    const { event } = createImportEvent(
      jsonFile({ format: "draftly-resume", version: 1, resume }),
    );

    await handleJsonImport(event, callbacks);

    expect(callbacks.onImport).toHaveBeenCalledWith(resume);
  });

  it.each([
    ["wrong format", { format: "other", version: 1, resume: createResume() }],
    ["missing version", { format: "draftly-resume", resume: createResume() }],
    ["wrong version", { format: "draftly-resume", version: 2, resume: createResume() }],
    ["missing resume", { format: "draftly-resume", version: 1 }],
  ])("rejects a wrapped file with %s", async (_label, contents) => {
    const callbacks = createCallbacks();
    const { event } = createImportEvent(jsonFile(contents));

    await handleJsonImport(event, callbacks);

    expect(callbacks.onError).toHaveBeenLastCalledWith(
      "This Draftly JSON file has an unsupported format.",
    );
    expect(callbacks.onImport).not.toHaveBeenCalled();
    expect(callbacks.onImporting).toHaveBeenLastCalledWith(false);
  });

  it("rejects JSON that is not a resume", async () => {
    const callbacks = createCallbacks();
    const { event } = createImportEvent(jsonFile({ name: "only a name" }));

    await handleJsonImport(event, callbacks);

    expect(callbacks.onError).toHaveBeenLastCalledWith(
      "This JSON file does not contain valid resume data.",
    );
  });

  it("reports a parse error for malformed JSON", async () => {
    const callbacks = createCallbacks();
    const { event } = createImportEvent(jsonFile("{ not json"));

    await handleJsonImport(event, callbacks);

    expect(callbacks.onError).toHaveBeenLastCalledWith(
      expect.stringMatching(/JSON/),
    );
    expect(callbacks.onImport).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for non-Error failures", async () => {
    const callbacks = createCallbacks();
    const file = jsonFile("{}");
    Object.defineProperty(file, "text", { value: () => Promise.reject("nope") });
    const { event } = createImportEvent(file);

    await handleJsonImport(event, callbacks);

    expect(callbacks.onError).toHaveBeenLastCalledWith(
      "Unable to read this JSON file.",
    );
  });
});

describe("downloads", () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:resume");
  const revokeObjectURL = vi.fn<(url: string) => void>();
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function readBlob(blob: Blob) {
    return blob.text();
  }

  it("downloads the resume wrapped in the draftly-resume envelope", async () => {
    const resume = createResume({ name: " Alex Morgan " });

    downloadJson(resume);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await readBlob(blob))).toEqual({
      format: "draftly-resume",
      version: 1,
      resume,
    });

    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("Alex Morgan-resume.json");
    expect(anchor.href).toBe("blob:resume");
    expect(document.body.contains(anchor)).toBe(false);

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:resume");
  });

  it("uses a default file name when the name is blank", () => {
    downloadJson(createResume({ name: "   " }));

    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("resume-resume.json");
  });

  it("builds a Word-compatible HTML document with escaped content", async () => {
    const resume = createResume({
      name: "Ada <Lovelace>",
      role: 'R&D "Lead"',
      summary: "It's <b>bold</b>",
      skills: " Math , , Poetry ",
      experience: [
        createExperience({ role: "Analyst & Writer", from: "2020-01", to: "" }),
      ],
      photo: "data:image/jpeg;base64,AAAA",
      template: "creative",
    });

    downloadWord(resume);

    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/msword");
    const html = await readBlob(blob);

    // A UTF-8 byte order mark makes Word detect the encoding correctly.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(html).toContain("<title>Ada &lt;Lovelace&gt; - Resume</title>");
    expect(html).toContain("R&amp;D &quot;Lead&quot;");
    expect(html).toContain("It&#39;s &lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain('<span class="resume-skill">Math</span>');
    expect(html).toContain('<span class="resume-skill">Poetry</span>');
    expect(html).toContain("Analyst &amp; Writer");
    expect(html).toContain("Jan 2020 — Present");
    expect(html).toContain("State University");
    expect(html).toContain('<main class="resume creative">');
    expect(html).toContain('src="data:image/jpeg;base64,AAAA"');
    expect(html).toContain("#fffdfb");

    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("Ada <Lovelace>-resume.doc");
  });

  it("uses a default Word file name when the name is blank", () => {
    downloadWord(createResume({ name: "" }));

    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("resume-resume.doc");
  });

  it.each(["modern", "classic"] as const)(
    "applies the %s template styles and omits the photo when empty",
    async (template) => {
      downloadWord(createResume({ template, photo: "" }));

      const html = await readBlob(createObjectURL.mock.calls[0][0]);
      expect(html).toContain(`<main class="resume ${template}">`);
      expect(html).not.toContain('class="resume-photo"');
    },
  );
});
