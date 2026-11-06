import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Page-object style helpers for the resume editor. */
export class EditorPage {
  constructor(readonly page: Page) {}

  /**
   * Opens the editor and waits until React has hydrated and the draft request
   * has settled, so that the first interaction is not lost.
   */
  async goto() {
    await this.page.goto("/");
    await expect(this.page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(this.saveStatus).not.toHaveText("Connecting to server...");
  }

  get saveStatus() {
    return this.page.locator(".save-status");
  }

  get preview() {
    return this.page.locator("#resume-preview");
  }

  get heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  get stepCount() {
    return this.page.locator(".step-count");
  }

  sidebarLink(label: string) {
    return this.page
      .getByRole("navigation", { name: "Resume sections" })
      .getByRole("button", { name: label });
  }

  mobileNavLink(label: string) {
    return this.page.locator(".mobile-section-nav").getByRole("button", { name: label });
  }

  async openSection(label: "Personal details" | "Skills" | "Work experience" | "Education") {
    await this.sidebarLink(label).click();
    await expect(this.heading).toHaveText(new RegExp(`^${label}`));
  }

  /** Fields rendered by ResumeField: the label text is followed by an optional hint. */
  field(label: string, scope: Locator | Page = this.page) {
    return scope.getByLabel(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }

  /**
   * Every section panel stays mounted (hidden with the `hidden` attribute), so
   * repeat-card queries must be scoped to the section being edited.
   */
  sectionPanel(title: "Basic information" | "Work experience" | "Education" | "Skills & strengths") {
    return this.page.locator(".form-section").filter({
      has: this.page.locator(".form-section-title strong", { hasText: title }),
    });
  }

  get experienceCards() {
    return this.sectionPanel("Work experience").locator(".repeat-card");
  }

  get educationCards() {
    return this.sectionPanel("Education").locator(".repeat-card");
  }

  experienceCard(index: number) {
    return this.experienceCards.nth(index);
  }

  educationCard(index: number) {
    return this.educationCards.nth(index);
  }

  templateCard(name: "Modern" | "Classic" | "Creative") {
    return this.page.getByRole("button", { name: new RegExp(name) });
  }

  async openExportMenu() {
    await this.page.getByRole("button", { name: /^Export/ }).click();
    await expect(this.page.locator(".export-menu")).toBeVisible();
  }

  get importInput() {
    return this.page.locator("#resume-json-import");
  }

  get importMessage() {
    return this.page.locator(".import-message");
  }

  async expectSaved() {
    await expect(this.saveStatus).toHaveText("Saved");
  }
}
