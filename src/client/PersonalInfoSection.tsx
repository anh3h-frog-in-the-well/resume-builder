"use client";

import { useState, type ChangeEvent } from "react";
import type { Resume, ResumeUpdater } from "../interface/resume";
import Icon from "./Icon";
import ResumeField from "./ResumeField";

type PersonalInfoSectionProps = {
  resume: Resume;
  onUpdate: ResumeUpdater;
};

export default function PersonalInfoSection({
  resume,
  onUpdate,
}: PersonalInfoSectionProps) {
  const [photoError, setPhotoError] = useState("");
  const [isPolishingSummary, setIsPolishingSummary] = useState(false);
  const [polishSummaryError, setPolishSummaryError] = useState("");
  const [polishSummaryStatus, setPolishSummaryStatus] = useState("");

  const handlePolishSummary = async () => {
    setPolishSummaryError("");
    setPolishSummaryStatus("");
    setIsPolishingSummary(true);
    try {
      const response = await fetch("/api/polish-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: resume.summary }),
      });
      const payload: unknown = await response.json();
      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("summary" in payload) ||
        typeof payload.summary !== "string"
      ) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to polish the summary. Please try again.";
        throw new Error(message);
      }
      onUpdate("summary", payload.summary);
      setPolishSummaryStatus("Polished with local AI. Review before using.");
    } catch (error) {
      console.error("Unable to polish the professional summary.", error);
      setPolishSummaryError(
        error instanceof Error
          ? error.message
          : "Unable to polish the summary. Please try again.",
      );
    } finally {
      setIsPolishingSummary(false);
    }
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setPhotoError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoError("Choose a JPG, PNG, or WebP image.");
      input.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError("Choose an image smaller than 10 MB.");
      input.value = "";
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        throw new Error("Your browser could not process this image.");
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      const photo = canvas.toDataURL("image/jpeg", 0.82);
      if (photo.length > 600_000) {
        throw new Error("This image is too large after processing. Try another one.");
      }
      onUpdate("photo", photo);
    } catch (error) {
      console.error("Unable to process the selected resume photo.", error);
      setPhotoError(
        error instanceof Error
          ? error.message
          : "Unable to process this image. Try another one.",
      );
    } finally {
      input.value = "";
    }
  };

  return (
    <div className="form-section">
      <div className="form-section-title">
        <span className="section-icon"><Icon name="user" size={17} /></span>
        <div><strong>Basic information</strong><span>Your name and the best way to reach you.</span></div>
      </div>
      <div className="form-grid">
        <ResumeField label="Full name" value={resume.name} onChange={(value) => onUpdate("name", value)} placeholder="e.g. Alex Morgan" />
        <ResumeField label="Professional title" value={resume.role} onChange={(value) => onUpdate("role", value)} placeholder="e.g. Product Designer" />
        <ResumeField label="Email address" value={resume.email} onChange={(value) => onUpdate("email", value)} placeholder="you@example.com" type="email" />
        <ResumeField label="Phone number" value={resume.phone} onChange={(value) => onUpdate("phone", value)} placeholder="+1 (555) 000-0000" />
        <ResumeField label="Location" value={resume.location} onChange={(value) => onUpdate("location", value)} placeholder="City, Country" />
        <ResumeField label="Website or portfolio" value={resume.website} onChange={(value) => onUpdate("website", value)} placeholder="yourwebsite.com" />
      </div>
      <div className="photo-uploader">
        <div className="photo-preview">
          {resume.photo ? (
            // The photo is locally processed and validated as an image data URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resume.photo} alt="Resume profile" />
          ) : (
            <Icon name="user" size={25} />
          )}
        </div>
        <div className="photo-upload-copy">
          <strong>Profile photo <span>OPTIONAL</span></strong>
          <p>Add a clear headshot. We&apos;ll resize it automatically.</p>
          <div className="photo-upload-actions">
            <label className="photo-upload-button" htmlFor="resume-photo">
              {resume.photo ? "Change photo" : "Upload photo"}
            </label>
            {resume.photo && (
              <button
                className="photo-remove-button"
                type="button"
                onClick={() => onUpdate("photo", "")}
              >
                Remove
              </button>
            )}
            <input
              id="resume-photo"
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
            />
          </div>
          {photoError && <span className="photo-error" role="alert">{photoError}</span>}
        </div>
      </div>
      <div className="form-section-title summary-title">
        <span className="section-icon"><Icon name="spark" size={17} /></span>
        <div><strong>Professional summary</strong><span>A short introduction that makes a strong first impression.</span></div>
      </div>
      <ResumeField
        label="About you"
        value={resume.summary}
        onChange={(value) => onUpdate("summary", value)}
        placeholder="What do you do best? What are you looking for?"
        multiline
        disabled={isPolishingSummary}
        hint={`${resume.summary.length} characters · Aim for 2–4 sentences`}
      />
      <div className="summary-polish">
        <button
          className="summary-polish-button"
          type="button"
          disabled={isPolishingSummary || !resume.summary.trim()}
          onClick={() => void handlePolishSummary()}
        >
          <Icon name="spark" size={15} />
          {isPolishingSummary ? "Polishing..." : "Polish with local AI"}
        </button>
        <span>Uses your local Ollama server; your summary is not sent to a cloud AI.</span>
      </div>
      {polishSummaryError && (
        <p className="summary-polish-message has-error" role="alert">
          {polishSummaryError}
        </p>
      )}
      {polishSummaryStatus && (
        <p className="summary-polish-message" role="status">
          {polishSummaryStatus}
        </p>
      )}
    </div>
  );
}
