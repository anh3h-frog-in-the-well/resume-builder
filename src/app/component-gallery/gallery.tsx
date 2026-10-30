"use client";

import type { ComponentType } from "react";
import {
  Empty as EmptyExperienceSectionStory,
  Interactive as ExperienceSectionStory,
} from "../../client/ExperienceSection.story";
import { Textarea, TextInput } from "../../client/ResumeField.story";
import { Interactive as PersonalInfoSectionStory } from "../../client/PersonalInfoSection.story";
import { Interactive as ResumeHeaderStory } from "../../client/ResumeHeader.story";

const stories: Record<string, ComponentType> = {
  "client/ResumeField/TextInput": TextInput,
  "client/ResumeField/Textarea": Textarea,
  "client/ExperienceSection/Interactive": ExperienceSectionStory,
  "client/ExperienceSection/Empty": EmptyExperienceSectionStory,
  "client/PersonalInfoSection/Interactive": PersonalInfoSectionStory,
  "client/ResumeHeader/Interactive": ResumeHeaderStory,
};

export default function ComponentGallery({ storyId }: { storyId: string | null }) {
  const Story = storyId ? stories[storyId] : null;
  return <div id="root">{Story && <Story />}</div>;
}
