import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../../../src/app/page";
import type { Resume, ResumeVersion } from "../../../src/interface/resume";
import { createExperience, createResume } from "../fixtures/resume";
import { getAllFields, getField } from "../helpers";

const { useSession, signOut } = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession, signOut }));

const downloadJson = vi.hoisted(() => vi.fn());
const downloadWord = vi.hoisted(() => vi.fn());

vi.mock("../../../src/util/helper", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/util/helper")>();
  return { ...actual, downloadJson, downloadWord };
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type FetchCall = { url: string; init?: RequestInit };

type FakeVersion = ResumeVersion;

type FakeApiOptions = {
  /** Versions held by the fake server, in creation order. */
  versions?: FakeVersion[];
  /** Reported by GET /api/resumes when the sample resume was just created. */
  isNew?: boolean;
  listStatus?: number;
  getStatus?: number;
  putStatus?: number;
  createStatus?: number;
  patchStatus?: number;
  deleteStatus?: number;
};

let versionCounter = 0;
function fakeVersion(
  overrides: Partial<FakeVersion> = {},
  resumeOverrides: Partial<Resume> = {},
): FakeVersion {
  versionCounter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(versionCounter).padStart(12, "0")}`,
    title: "My resume",
    updatedAt: "2024-01-01T00:00:00.000Z",
    resume: createResume(resumeOverrides),
    ...overrides,
  };
}

/**
 * Installs a fetch mock that behaves like the resume versions API: it serves
 * the list and the individual versions, and records every mutation so tests
 * can assert what the page sent.
 */
function mockResumeApi(options: FakeApiOptions = {}) {
  const state = {
    versions: options.versions ?? [fakeVersion()],
    isNew: options.isNew ?? false,
    ...options,
  };
  const calls: FetchCall[] = [];
  const json = (body: unknown, status = 200) => jsonResponse(body, status);
  const summary = ({ id, title, updatedAt }: FakeVersion) => ({ id, title, updatedAt });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, init });

    if (url === "/api/resumes" && method === "GET") {
      if (state.listStatus) return json({ error: "Database unavailable." }, state.listStatus);
      return json({ resumes: state.versions.map(summary), isNew: state.isNew });
    }
    if (url === "/api/resumes" && method === "POST") {
      if (state.createStatus) return json({ error: "Unable to create the resume." }, state.createStatus);
      const body = JSON.parse(String(init?.body)) as { title: string; resume: Resume };
      const created = fakeVersion({ title: body.title, resume: body.resume });
      state.versions.push(created);
      return json(summary(created), 201);
    }

    const match = url.match(/^\/api\/resumes\/([^/]+)$/);
    if (match) {
      const version = state.versions.find((entry) => entry.id === match[1]);
      if (method === "GET") {
        if (state.getStatus) return json({ error: "Unable to load the resume." }, state.getStatus);
        return version ? json(version) : json({ error: "Not found." }, 404);
      }
      if (method === "PUT") {
        if (state.putStatus) return json({ error: "nope" }, state.putStatus);
        if (!version) return json({ error: "Not found." }, 404);
        version.resume = JSON.parse(String(init?.body)) as Resume;
        return json({ ok: true });
      }
      if (method === "PATCH") {
        if (state.patchStatus) return json({ error: "Unable to rename the resume." }, state.patchStatus);
        if (!version) return json({ error: "Not found." }, 404);
        version.title = (JSON.parse(String(init?.body)) as { title: string }).title;
        return json({ ok: true, title: version.title });
      }
      if (method === "DELETE") {
        if (state.deleteStatus) return json({ error: "Unable to delete the resume." }, state.deleteStatus);
        if (!version) return json({ error: "Not found." }, 404);
        state.versions = state.versions.filter((entry) => entry !== version);
        return json({ ok: true });
      }
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  const byMethod = (method: string) => calls.filter((call) => (call.init?.method ?? "GET") === method);
  return {
    fetchMock,
    state,
    calls,
    puts: () => byMethod("PUT"),
    lastSavedResume: () => {
      const put = byMethod("PUT").at(-1);
      return put ? (JSON.parse(String(put.init?.body)) as Resume) : undefined;
    },
    lastSavedId: () => byMethod("PUT").at(-1)?.url.split("/").pop(),
  };
}

function preview() {
  return document.getElementById("resume-preview") as HTMLElement;
}

async function waitForLabel(text: string) {
  await waitFor(() => expect(screen.getByText(text)).toHaveClass("save-status"), {
    timeout: 3000,
  });
}

describe("Home page", () => {
  beforeEach(() => {
    useSession.mockReturnValue({
      status: "authenticated",
      data: {
        user: { id: "user-1", name: "Alex Morgan", email: "alex@example.com" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      update: vi.fn(),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("loading the draft", () => {
    it("restores the last opened resume from the server", async () => {
      const api = mockResumeApi({
        versions: [fakeVersion({ title: "General" }), fakeVersion({ title: "Saved Person" }, { name: "Saved Person" })],
      });
      window.localStorage.setItem("draftly-active-resume", api.state.versions[1].id);
      render(<Home />);

      expect(screen.getByText("Connecting to server...")).toBeInTheDocument();
      await waitForLabel("Restored from server");

      expect(getField("Full name")).toHaveValue("Saved Person");
      expect(within(preview()).getByRole("heading", { name: "Saved Person" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Switch resume" })).toHaveTextContent("Saved Person");
      expect(api.fetchMock).toHaveBeenCalledWith("/api/resumes");
      expect(api.fetchMock).toHaveBeenCalledWith(`/api/resumes/${api.state.versions[1].id}`);

      // Loading does not write anything back.
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(api.puts()).toHaveLength(0);
    });

    it("falls back to the first resume when the remembered one is gone", async () => {
      const api = mockResumeApi({
        versions: [fakeVersion({ title: "First" }, { name: "First Person" })],
      });
      window.localStorage.setItem("draftly-active-resume", "00000000-0000-4000-8000-999999999999");
      render(<Home />);

      await waitForLabel("Restored from server");
      expect(getField("Full name")).toHaveValue("First Person");
      expect(window.localStorage.getItem("draftly-active-resume")).toBe(api.state.versions[0].id);
    });

    it("labels the sample resume of a new account as a new draft", async () => {
      mockResumeApi({
        versions: [fakeVersion({}, { name: "Max Mustermann" })],
        isNew: true,
      });
      render(<Home />);

      await waitForLabel("New draft");
      expect(getField("Full name")).toHaveValue("Max Mustermann");
      expect(within(preview()).getByText("Max Mustermann")).toBeInTheDocument();
    });

    it("reports a failed list request and does not autosave", async () => {
      const api = mockResumeApi({ listStatus: 503 });
      render(<Home />);

      await waitForLabel("Server load failed");
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(api.puts()).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Switch resume" })).toBeDisabled();
    });

    it("reports a failed resume request", async () => {
      mockResumeApi({ getStatus: 503 });
      render(<Home />);

      await waitForLabel("Server load failed");
    });

    it("rejects an invalid list payload from the server", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ resumes: [{ id: "nope" }] })),
      );
      render(<Home />);

      await waitForLabel("Server load failed");
    });

    it("rejects an invalid resume payload from the server", async () => {
      const version = fakeVersion();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) =>
          String(input) === "/api/resumes"
            ? jsonResponse({ resumes: [{ id: version.id, title: version.title, updatedAt: version.updatedAt }] })
            : jsonResponse({ ...version, resume: { name: "broken" } }),
        ),
      );
      render(<Home />);

      await waitForLabel("Server load failed");
    });
  });

  describe("autosave", () => {
    it("debounces edits and saves them to the open resume and localStorage", async () => {
      const user = userEvent.setup();
      const api = mockResumeApi();
      render(<Home />);
      await waitForLabel("Restored from server");

      await user.clear(getField("Full name"));
      await user.type(getField("Full name"), "Jo");
      expect(screen.getByText("Unsaved changes")).toHaveClass("save-status");

      await waitForLabel("Saved");
      // Several keystrokes collapse into a single save.
      expect(api.puts()).toHaveLength(1);
      expect(api.lastSavedId()).toBe(api.state.versions[0].id);
      expect(api.lastSavedResume()?.name).toBe("Jo");
      expect(api.puts().at(-1)?.init?.headers).toEqual({
        "Content-Type": "application/json",
      });
      expect(
        JSON.parse(window.localStorage.getItem("draftly-resume") ?? "{}").name,
      ).toBe("Jo");
    });

    it("shows a save failure when the server rejects the draft", async () => {
      const user = userEvent.setup();
      mockResumeApi({ putStatus: 503 });
      render(<Home />);
      await waitForLabel("Restored from server");

      await user.type(getField("Full name"), "!");

      await waitForLabel("Server save failed");
    });

    it("still saves to the server when localStorage is unavailable", async () => {
      const user = userEvent.setup();
      const api = mockResumeApi();
      render(<Home />);
      await waitForLabel("Restored from server");
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      await user.type(getField("Full name"), "!");

      await waitForLabel("Saved");
      expect(api.puts().length).toBe(1);
    });
  });

  describe("section navigation", () => {
    async function renderReady() {
      mockResumeApi();
      render(<Home />);
      await waitForLabel("Restored from server");
    }

    it("starts on personal details and walks through every step", async () => {
      const user = userEvent.setup();
      await renderReady();

      const heading = () => screen.getByRole("heading", { level: 1 });
      expect(heading()).toHaveTextContent("Personal details");
      expect(screen.getByText("1", { selector: ".step-count" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Back/ })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: /Continue/ }));
      expect(heading()).toHaveTextContent("Skills");
      expect(
        screen.getByText("Highlight the strengths that make you the right fit for your next role."),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Continue/ }));
      expect(heading()).toHaveTextContent("Work experience");

      await user.click(screen.getByRole("button", { name: /Continue/ }));
      expect(heading()).toHaveTextContent("Education");
      expect(screen.getByText("4", { selector: ".step-count" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Continue/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Finish resume/ })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Back/ }));
      expect(heading()).toHaveTextContent("Work experience");
    });

    it("jumps to a section from the sidebar and the mobile nav", async () => {
      const user = userEvent.setup();
      await renderReady();
      const sidebar = within(screen.getByRole("navigation", { name: "Resume sections" }));

      await user.click(sidebar.getByRole("button", { name: "Education" }));
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Education");
      expect(sidebar.getByRole("button", { name: "Education" })).toHaveClass("active");
      expect(sidebar.getByRole("button", { name: "Personal details" })).not.toHaveClass("active");

      const mobileNav = document.querySelector(".mobile-section-nav") as HTMLElement;
      await user.click(within(mobileNav).getByRole("button", { name: "Skills" }));
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Skills");
      expect(within(mobileNav).getByRole("button", { name: "Skills" })).toHaveClass("active");
    });

    it("only shows the active section's editor", async () => {
      const user = userEvent.setup();
      await renderReady();

      const personalPanel = getField("Full name").closest("[hidden], div:not([hidden])");
      expect(getField("Full name").closest("div[hidden]")).toBeNull();
      expect(getField("Your skills").closest("div[hidden]")).not.toBeNull();
      expect(personalPanel).not.toBeNull();

      await user.click(screen.getByRole("button", { name: /Continue/ }));
      expect(getField("Full name").closest("div[hidden]")).not.toBeNull();
      expect(getField("Your skills").closest("div[hidden]")).toBeNull();
    });

    it("prints the resume from the final step", async () => {
      const user = userEvent.setup();
      const print = vi.fn();
      vi.stubGlobal("print", print);
      await renderReady();

      await user.click(
        within(screen.getByRole("navigation", { name: "Resume sections" })).getByRole(
          "button",
          { name: "Education" },
        ),
      );
      await user.click(screen.getByRole("button", { name: /Finish resume/ }));

      expect(print).toHaveBeenCalledTimes(1);
    });
  });

  describe("live preview", () => {
    it("mirrors edits from every section", async () => {
      // Typing is covered by the field tests; paste keeps this long scenario fast.
      const user = userEvent.setup();
      const paste = async (
        pasteUser: ReturnType<typeof userEvent.setup>,
        field: HTMLElement,
        text: string,
      ) => {
        await pasteUser.click(field);
        await pasteUser.paste(text);
      };
      mockResumeApi({
        versions: [
          fakeVersion(
            {},
            {
              name: "",
              role: "",
              email: "",
              phone: "",
              location: "",
              website: "",
              summary: "",
              skills: "",
              experience: [createExperience({ role: "", company: "", description: "", from: "", to: "" })],
              education: [{ school: "", degree: "", dates: "" }],
            },
          ),
        ],
      });
      render(<Home />);
      await waitForLabel("Restored from server");

      const paper = () => within(preview());
      expect(paper().getByText("Your Name")).toBeInTheDocument();
      expect(paper().getByText("Your professional title")).toBeInTheDocument();
      expect(paper().queryByText("Profile")).not.toBeInTheDocument();
      expect(paper().queryByText("Skills")).not.toBeInTheDocument();
      expect(paper().getByText("Position title")).toBeInTheDocument();
      expect(paper().getByText("Company name")).toBeInTheDocument();
      expect(paper().getByText("Degree or qualification")).toBeInTheDocument();
      expect(paper().getByText("School or institution")).toBeInTheDocument();

      await paste(user, getField("Full name"), "Sam Lee");
      await paste(user, getField("Professional title"), "Engineer");
      await paste(user, getField("Email address"), "sam@example.com");
      await paste(user, getField("About you"), "I build things.");
      expect(paper().getByRole("heading", { name: "Sam Lee" })).toBeInTheDocument();
      expect(paper().getByText("Engineer")).toBeInTheDocument();
      expect(paper().getByText("sam@example.com")).toBeInTheDocument();
      expect(paper().getByText("Profile")).toBeInTheDocument();
      expect(paper().getByText("I build things.")).toBeInTheDocument();

      await paste(user, getField("Your skills"), "TypeScript, , React");
      expect(paper().getByText("Skills")).toBeInTheDocument();
      const chips = preview().querySelectorAll(".resume-skills span");
      expect(Array.from(chips).map((chip) => chip.textContent)).toEqual([
        "TypeScript",
        "React",
      ]);

      await paste(user, getAllFields("Job title")[0], "Lead");
      await paste(user, getAllFields("Company")[0], "Acme");
      await paste(user, getAllFields("From")[0], "2020-02");
      await paste(user, getAllFields("What did you accomplish?")[0], "Shipped it.");
      expect(paper().getByText("Lead")).toBeInTheDocument();
      expect(paper().getByText("Acme")).toBeInTheDocument();
      expect(paper().getByText("Feb 2020 — Present")).toBeInTheDocument();
      expect(paper().getByText("Shipped it.")).toBeInTheDocument();

      await paste(user, getField("School or institution"), "MIT");
      await paste(user, getField("Degree or qualification"), "BSc");
      await paste(user, getField("Dates"), "2010");
      expect(paper().getByText("MIT")).toBeInTheDocument();
      expect(paper().getByText("BSc")).toBeInTheDocument();
      expect(paper().getByText("2010")).toBeInTheDocument();
    });

    it("hides experience and education sections when the lists are empty", async () => {
      const user = userEvent.setup();
      mockResumeApi();
      render(<Home />);
      await waitForLabel("Restored from server");

      expect(within(preview()).getByText("Experience")).toBeInTheDocument();
      expect(within(preview()).getByText("Education")).toBeInTheDocument();

      const sidebar = within(screen.getByRole("navigation", { name: "Resume sections" }));
      await user.click(sidebar.getByRole("button", { name: "Work experience" }));
      await user.click(screen.getByRole("button", { name: "Remove position 1" }));
      await user.click(sidebar.getByRole("button", { name: "Education" }));
      await user.click(screen.getByRole("button", { name: "Remove education 1" }));

      expect(within(preview()).queryByText("Experience")).not.toBeInTheDocument();
      expect(within(preview()).queryByText("Education")).not.toBeInTheDocument();
    });

    it("renders the photo in the preview when one is set", async () => {
      const photo = "data:image/png;base64,AAAA";
      mockResumeApi({ versions: [fakeVersion({}, { photo })] });
      render(<Home />);
      await waitForLabel("Restored from server");

      const image = preview().querySelector("img.resume-photo");
      expect(image).toHaveAttribute("src", photo);
    });
  });

  describe("templates", () => {
    it("switches the preview template and marks the selected card", async () => {
      const user = userEvent.setup();
      const api = mockResumeApi();
      render(<Home />);
      await waitForLabel("Restored from server");

      const modern = screen.getByRole("button", { name: /Modern/ });
      const classic = screen.getByRole("button", { name: /Classic/ });
      const creative = screen.getByRole("button", { name: /Creative/ });
      expect(modern).toHaveAttribute("aria-pressed", "true");
      expect(modern).toHaveClass("selected");
      expect(preview()).toHaveClass("template-modern");

      await user.click(classic);
      expect(classic).toHaveAttribute("aria-pressed", "true");
      expect(modern).toHaveAttribute("aria-pressed", "false");
      expect(preview()).toHaveClass("template-classic");

      await user.click(creative);
      expect(preview()).toHaveClass("template-creative");
      expect(screen.getByText("Warm & expressive")).toBeInTheDocument();

      await waitForLabel("Saved");
      expect(api.lastSavedResume()?.template).toBe("creative");
    });
  });

  describe("JSON import", () => {
    async function importFile(user: ReturnType<typeof userEvent.setup>, file: File) {
      await user.upload(screen.getByLabelText("Import JSON", { selector: "input" }), file);
    }

    it("replaces the resume, shows a status and saves the import", async () => {
      const user = userEvent.setup();
      const api = mockResumeApi();
      render(<Home />);
      await waitForLabel("Restored from server");

      const imported = createResume({ name: "Imported Person", template: "classic" });
      await importFile(
        user,
        new File([JSON.stringify(imported)], "import.json", { type: "application/json" }),
      );

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Resume imported. Review the details; your changes are being saved.",
      );
      expect(getField("Full name")).toHaveValue("Imported Person");
      expect(preview()).toHaveClass("template-classic");

      await waitForLabel("Saved");
      expect(api.lastSavedResume()?.name).toBe("Imported Person");
    });

    it("shows an error for invalid files and lets the user dismiss it", async () => {
      const user = userEvent.setup({ applyAccept: false });
      mockResumeApi();
      render(<Home />);
      await waitForLabel("Restored from server");

      await importFile(user, new File(["{}"], "notes.txt", { type: "text/plain" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Choose a JSON file.");
      expect(alert).toHaveClass("import-message", "has-error");
      expect(getField("Full name")).toHaveValue("Alex Morgan");

      await user.click(screen.getByRole("button", { name: "Dismiss message" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows an error for JSON that is not a resume", async () => {
      const user = userEvent.setup();
      mockResumeApi();
      render(<Home />);
      await waitForLabel("Restored from server");

      await importFile(
        user,
        new File(['{"hello":"world"}'], "bad.json", { type: "application/json" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "This JSON file does not contain valid resume data.",
      );
    });
  });

  describe("export", () => {
    it("passes the current resume to the export helpers", async () => {
      const user = userEvent.setup();
      mockResumeApi({ versions: [fakeVersion({}, { name: "Export Me" })] });
      render(<Home />);
      await waitForLabel("Restored from server");

      await user.click(screen.getByRole("button", { name: /Export/ }));
      await user.click(screen.getByRole("button", { name: /JSON file/ }));
      expect(downloadJson).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Export Me" }),
      );

      await user.click(screen.getByRole("button", { name: /Export/ }));
      await user.click(screen.getByRole("button", { name: /Word document/ }));
      expect(downloadWord).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Export Me" }),
      );
    });
  });

  describe("account", () => {
    it("shows the signed-in account in the sidebar", async () => {
      mockResumeApi();
      render(<Home />);
      await waitForLabel("Restored from server");

      expect(screen.getByText("Alex Morgan", { selector: "strong" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    });
  });

  describe("resume versions", () => {
    async function renderWithVersions(options: FakeApiOptions = {}) {
      const api = mockResumeApi({
        versions: [
          fakeVersion({ title: "General" }, { name: "General Person" }),
          fakeVersion({ title: "Frontend" }, { name: "Frontend Person", template: "classic" }),
        ],
        ...options,
      });
      render(<Home />);
      await waitForLabel("Restored from server");
      return api;
    }

    const switcher = () => screen.getByRole("button", { name: "Switch resume" });
    const menu = () => screen.getByRole("menu", { name: "Your resumes" });

    it("opens another version and remembers it", async () => {
      const user = userEvent.setup();
      const api = await renderWithVersions();
      expect(switcher()).toHaveTextContent("General");
      expect(switcher()).toHaveTextContent("2 / 10");

      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitemradio", { name: "Frontend" }));

      await waitForLabel("Restored from server");
      expect(switcher()).toHaveTextContent("Frontend");
      expect(getField("Full name")).toHaveValue("Frontend Person");
      expect(preview()).toHaveClass("template-classic");
      expect(window.localStorage.getItem("draftly-active-resume")).toBe(api.state.versions[1].id);
      expect(api.puts()).toHaveLength(0);
    });

    it("flushes unsaved edits before switching", async () => {
      const user = userEvent.setup();
      const api = await renderWithVersions();

      await user.type(getField("Full name"), "!");
      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitemradio", { name: "Frontend" }));

      await waitFor(() => expect(switcher()).toHaveTextContent("Frontend"));
      expect(api.puts()).toHaveLength(1);
      expect(api.lastSavedId()).toBe(api.state.versions[0].id);
      expect(api.lastSavedResume()?.name).toBe("General Person!");
    });

    it("refuses to switch when pending edits cannot be saved", async () => {
      const user = userEvent.setup();
      const api = await renderWithVersions({ putStatus: 503 });

      await user.type(getField("Full name"), "!");
      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitemradio", { name: "Frontend" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Your latest changes could not be saved. Please try again.",
      );
      expect(switcher()).toHaveTextContent("General");
      expect(api.fetchMock).not.toHaveBeenCalledWith(`/api/resumes/${api.state.versions[1].id}`);
    });

    it("falls back to a generic message when the error body is not JSON", async () => {
      const user = userEvent.setup();
      const api = await renderWithVersions();
      const original = api.fetchMock.getMockImplementation();
      api.fetchMock.mockImplementation(async (input, init) =>
        String(input) === `/api/resumes/${api.state.versions[1].id}` && !init?.method
          ? new Response("Service unavailable", { status: 503 })
          : original!(input, init),
      );

      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitemradio", { name: "Frontend" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Database returned HTTP 503.");
    });

    it("still works when localStorage is blocked", async () => {
      const user = userEvent.setup();
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      await renderWithVersions();

      expect(switcher()).toHaveTextContent("General");
      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitemradio", { name: "Frontend" }));
      await waitFor(() => expect(switcher()).toHaveTextContent("Frontend"));
    });

    it("reports when a version cannot be opened", async () => {
      const user = userEvent.setup();
      const api = await renderWithVersions();
      api.state.getStatus = 503;

      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitemradio", { name: "Frontend" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load the resume.");
      await waitForLabel("Server load failed");
    });

    it("creates a blank resume, opens it and starts on the first step", async () => {
      const user = userEvent.setup();
      const api = await renderWithVersions();
      await user.click(
        within(screen.getByRole("navigation", { name: "Resume sections" })).getByRole("button", {
          name: "Skills",
        }),
      );

      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitem", { name: "New blank resume" }));

      await waitFor(() => expect(switcher()).toHaveTextContent("Resume 3"));
      expect(screen.getByRole("status")).toHaveTextContent('"Resume 3" is ready to edit.');
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Personal details");
      expect(getField("Full name")).toHaveValue("");
      expect(within(preview()).getByText("Your Name")).toBeInTheDocument();
      expect(screen.getByText("Saved")).toHaveClass("save-status");

      const post = api.calls.find((call) => call.init?.method === "POST");
      expect(JSON.parse(String(post?.init?.body))).toMatchObject({
        title: "Resume 3",
        resume: { name: "", experience: [], education: [] },
      });
      expect(window.localStorage.getItem("draftly-active-resume")).toBe(api.state.versions[2].id);
    });

    it("duplicates the open resume with its unsaved edits", async () => {
      const user = userEvent.setup();
      const api = await renderWithVersions();

      await user.type(getField("Full name"), "!");
      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitem", { name: "Duplicate this resume" }));

      await waitFor(() => expect(switcher()).toHaveTextContent("General (copy)"));
      expect(getField("Full name")).toHaveValue("General Person!");
      const post = api.calls.find((call) => call.init?.method === "POST");
      expect(JSON.parse(String(post?.init?.body))).toMatchObject({
        title: "General (copy)",
        resume: { name: "General Person!" },
      });
      // The edit was flushed to the original first.
      expect(api.lastSavedId()).toBe(api.state.versions[0].id);
    });

    it("shows the server error when creating fails", async () => {
      const user = userEvent.setup();
      await renderWithVersions({ createStatus: 409 });

      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitem", { name: "New blank resume" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create the resume.");
      expect(switcher()).toHaveTextContent("General");
      expect(switcher()).toHaveTextContent("2 / 10");
    });

    it("renames the open resume", async () => {
      const user = userEvent.setup();
      const api = await renderWithVersions();

      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitem", { name: "Rename" }));
      await user.clear(within(menu()).getByLabelText("Resume title"));
      await user.type(within(menu()).getByLabelText("Resume title"), "Backend roles");
      await user.click(within(menu()).getByRole("button", { name: "Save title" }));

      await waitFor(() => expect(switcher()).toHaveTextContent("Backend roles"));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      const patch = api.calls.find((call) => call.init?.method === "PATCH");
      expect(patch?.url).toBe(`/api/resumes/${api.state.versions[0].id}`);
      expect(JSON.parse(String(patch?.init?.body))).toEqual({ title: "Backend roles" });
    });

    it("keeps the rename form open when the server rejects the title", async () => {
      const user = userEvent.setup();
      await renderWithVersions({ patchStatus: 503 });

      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitem", { name: "Rename" }));
      await user.type(within(menu()).getByLabelText("Resume title"), "!");
      await user.click(within(menu()).getByRole("button", { name: "Save title" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Unable to rename the resume.");
      expect(within(menu()).getByLabelText("Resume title")).toHaveValue("General!");
      expect(switcher()).toHaveTextContent("General");
    });

    it("deletes the open resume after confirmation and opens the next one", async () => {
      const user = userEvent.setup();
      const api = await renderWithVersions();
      const frontendId = api.state.versions[1].id;
      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitemradio", { name: "Frontend" }));
      await waitFor(() => expect(switcher()).toHaveTextContent("Frontend"));

      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitem", { name: "Delete" }));
      expect(menu()).toHaveTextContent("Delete Frontend? This cannot be undone.");
      await user.click(within(menu()).getByRole("button", { name: "Delete resume" }));

      await waitFor(() => expect(switcher()).toHaveTextContent("General"));
      expect(switcher()).toHaveTextContent("1 / 10");
      expect(getField("Full name")).toHaveValue("General Person");
      expect(screen.getByRole("status")).toHaveTextContent('"Frontend" was deleted.');
      const remove = api.calls.find((call) => call.init?.method === "DELETE");
      expect(remove?.url).toBe(`/api/resumes/${frontendId}`);
      expect(api.state.versions.map((version) => version.title)).toEqual(["General"]);
    });

    it("shows the server error when deleting fails", async () => {
      const user = userEvent.setup();
      await renderWithVersions({ deleteStatus: 409 });

      await user.click(switcher());
      await user.click(within(menu()).getByRole("menuitem", { name: "Delete" }));
      await user.click(within(menu()).getByRole("button", { name: "Delete resume" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Unable to delete the resume.");
      expect(switcher()).toHaveTextContent("2 / 10");
    });
  });
});
