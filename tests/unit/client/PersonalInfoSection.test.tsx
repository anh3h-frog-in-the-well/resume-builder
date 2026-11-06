import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PersonalInfoSection from "../../../src/client/PersonalInfoSection";
import { createResume, tinyJpegDataUrl } from "../fixtures/resume";
import { getField } from "../helpers";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type CanvasStubOptions = {
  context?: boolean;
  dataUrl?: string;
};

function stubImageProcessing({
  context = true,
  dataUrl = tinyJpegDataUrl,
}: CanvasStubOptions = {}) {
  const bitmap = { width: 1200, height: 800, close: vi.fn() };
  const createImageBitmap = vi.fn().mockResolvedValue(bitmap);
  vi.stubGlobal("createImageBitmap", createImageBitmap);

  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(function (this: HTMLCanvasElement) {
      if (!context) return null;
      return {
        fillStyle: "",
        fillRect,
        drawImage,
      } as unknown as CanvasRenderingContext2D;
    });
  const toDataURL = vi
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockReturnValue(dataUrl);

  return { bitmap, createImageBitmap, drawImage, fillRect, getContext, toDataURL };
}

describe("PersonalInfoSection", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("basic information", () => {
    it("renders every contact field with the current values", () => {
      render(<PersonalInfoSection resume={createResume()} onUpdate={vi.fn()} />);

      expect(getField("Full name")).toHaveValue("Alex Morgan");
      expect(getField("Professional title")).toHaveValue("Product Designer");
      expect(getField("Email address")).toHaveValue("alex@example.com");
      expect(getField("Email address")).toHaveAttribute("type", "email");
      expect(getField("Phone number")).toHaveValue("+1 555 000 0000");
      expect(getField("Location")).toHaveValue("Berlin, Germany");
      expect(getField("Website or portfolio")).toHaveValue("alexmorgan.design");
      expect(getField("About you")).toHaveValue(
        "Product designer with a love for clear interfaces.",
      );
    });

    it.each([
      ["Full name", "name"],
      ["Professional title", "role"],
      ["Email address", "email"],
      ["Phone number", "phone"],
      ["Location", "location"],
      ["Website or portfolio", "website"],
      ["About you", "summary"],
    ] as const)("updates %s through onUpdate(%s)", async (label, key) => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const resume = createResume();
      render(<PersonalInfoSection resume={resume} onUpdate={onUpdate} />);

      await user.type(getField(label), "!");

      expect(onUpdate).toHaveBeenCalledWith(key, `${resume[key]}!`);
    });

    it("shows a live character count for the summary", () => {
      render(
        <PersonalInfoSection
          resume={createResume({ summary: "Hello" })}
          onUpdate={vi.fn()}
        />,
      );

      expect(
        screen.getByText("5 characters · Aim for 2–4 sentences"),
      ).toBeInTheDocument();
    });
  });

  describe("profile photo", () => {
    it("shows the upload call to action when there is no photo", () => {
      render(<PersonalInfoSection resume={createResume()} onUpdate={vi.fn()} />);

      expect(screen.getByText("Upload photo")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
      expect(screen.queryByAltText("Resume profile")).not.toBeInTheDocument();
    });

    it("shows the current photo with change and remove actions", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      render(
        <PersonalInfoSection
          resume={createResume({ photo: tinyJpegDataUrl })}
          onUpdate={onUpdate}
        />,
      );

      expect(screen.getByAltText("Resume profile")).toHaveAttribute(
        "src",
        tinyJpegDataUrl,
      );
      expect(screen.getByText("Change photo")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Remove" }));
      expect(onUpdate).toHaveBeenCalledWith("photo", "");
    });

    it("ignores a change event without a file", () => {
      const onUpdate = vi.fn();
      render(<PersonalInfoSection resume={createResume()} onUpdate={onUpdate} />);

      fireEvent.change(screen.getByLabelText("Upload photo"), {
        target: { files: [] },
      });

      expect(onUpdate).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("rejects unsupported file types", async () => {
      // Bypass the accept attribute so the component's own validation runs.
      const user = userEvent.setup({ applyAccept: false });
      const onUpdate = vi.fn();
      render(<PersonalInfoSection resume={createResume()} onUpdate={onUpdate} />);

      const input = screen.getByLabelText("Upload photo") as HTMLInputElement;
      await user.upload(input, new File(["gif"], "photo.gif", { type: "image/gif" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Choose a JPG, PNG, or WebP image.",
      );
      expect(onUpdate).not.toHaveBeenCalled();
      expect(input.value).toBe("");
    });

    it("rejects images above 10 MB", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      render(<PersonalInfoSection resume={createResume()} onUpdate={onUpdate} />);

      const bigFile = new File([""], "huge.png", { type: "image/png" });
      Object.defineProperty(bigFile, "size", { value: 10 * 1024 * 1024 + 1 });
      await user.upload(screen.getByLabelText("Upload photo"), bigFile);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Choose an image smaller than 10 MB.",
      );
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("resizes and stores the selected image as a JPEG data URL", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const stubs = stubImageProcessing();
      render(<PersonalInfoSection resume={createResume()} onUpdate={onUpdate} />);

      const file = new File(["png"], "photo.png", { type: "image/png" });
      await user.upload(screen.getByLabelText("Upload photo"), file);

      await waitFor(() =>
        expect(onUpdate).toHaveBeenCalledWith("photo", tinyJpegDataUrl),
      );
      expect(stubs.createImageBitmap).toHaveBeenCalledWith(file);
      // 1200x800 is scaled down so the longest edge is 600px.
      expect(stubs.drawImage).toHaveBeenCalledWith(stubs.bitmap, 0, 0, 600, 400);
      expect(stubs.fillRect).toHaveBeenCalledWith(0, 0, 600, 400);
      expect(stubs.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.82);
      expect(stubs.bitmap.close).toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("reports when the canvas is unavailable", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const stubs = stubImageProcessing({ context: false });
      render(<PersonalInfoSection resume={createResume()} onUpdate={onUpdate} />);

      await user.upload(
        screen.getByLabelText("Upload photo"),
        new File(["jpg"], "photo.jpg", { type: "image/jpeg" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Your browser could not process this image.",
      );
      expect(stubs.bitmap.close).toHaveBeenCalled();
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("rejects images that are still too large after processing", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      stubImageProcessing({
        dataUrl: `data:image/jpeg;base64,${"A".repeat(600_001)}`,
      });
      render(<PersonalInfoSection resume={createResume()} onUpdate={onUpdate} />);

      await user.upload(
        screen.getByLabelText("Upload photo"),
        new File(["webp"], "photo.webp", { type: "image/webp" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "This image is too large after processing. Try another one.",
      );
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("shows a generic message for unexpected decoding failures", async () => {
      const user = userEvent.setup();
      vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue("boom"));
      render(<PersonalInfoSection resume={createResume()} onUpdate={vi.fn()} />);

      await user.upload(
        screen.getByLabelText("Upload photo"),
        new File(["jpg"], "photo.jpg", { type: "image/jpeg" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Unable to process this image. Try another one.",
      );
    });
  });

  describe("summary polishing", () => {
    it("disables the polish button when the summary is blank", () => {
      render(
        <PersonalInfoSection
          resume={createResume({ summary: "  " })}
          onUpdate={vi.fn()}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Polish with local AI" }),
      ).toBeDisabled();
    });

    it("sends the summary to the API and applies the polished text", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      let resolveFetch: (value: Response) => void = () => {};
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      );
      render(
        <PersonalInfoSection
          resume={createResume({ summary: "I do design." })}
          onUpdate={onUpdate}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Polish with local AI" }));

      expect(screen.getByRole("button", { name: "Polishing..." })).toBeDisabled();
      expect(getField("About you")).toBeDisabled();
      expect(fetchMock).toHaveBeenCalledWith("/api/polish-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: "I do design." }),
      });

      resolveFetch(jsonResponse({ summary: "I craft design." }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Polished with local AI. Review before using.",
      );
      expect(onUpdate).toHaveBeenCalledWith("summary", "I craft design.");
      expect(getField("About you")).not.toBeDisabled();
    });

    it("shows the API error message when polishing fails", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Sign in to polish your professional summary." }, 401),
      );
      render(<PersonalInfoSection resume={createResume()} onUpdate={onUpdate} />);

      await user.click(screen.getByRole("button", { name: "Polish with local AI" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Sign in to polish your professional summary.",
      );
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("uses a generic message for malformed payloads", async () => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValueOnce(jsonResponse({ summary: 42 }));
      render(<PersonalInfoSection resume={createResume()} onUpdate={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Polish with local AI" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Unable to polish the summary. Please try again.",
      );
    });

    it("uses a generic message for non-Error rejections", async () => {
      const user = userEvent.setup();
      fetchMock.mockRejectedValueOnce("offline");
      render(<PersonalInfoSection resume={createResume()} onUpdate={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Polish with local AI" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Unable to polish the summary. Please try again.",
      );
    });
  });
});
