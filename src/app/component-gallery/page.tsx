import { notFound } from "next/navigation";
import ComponentGallery from "./gallery";

export default async function ComponentGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ story?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { story } = await searchParams;
  return <ComponentGallery storyId={typeof story === "string" ? story : null} />;
}
