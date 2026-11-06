import type { Metadata } from "next";
import AuthSessionProvider from "../client/AuthSessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Build a resume that feels like you",
  description:
    "Create, customize, and export a polished resume with Resume builder.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
