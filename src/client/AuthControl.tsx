"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export default function AuthControl() {
  const { data: session, status } = useSession();

  if (status !== "authenticated" || !session.user) {
    return (
      <Link className="profile-button" href="/login">
        <span className="profile-avatar">?</span>
        <span className="profile-copy">
          <strong>{status === "loading" ? "Loading account..." : "Sign in"}</strong>
          <small>Save across devices</small>
        </span>
      </Link>
    );
  }

  const name = session.user.name || session.user.email || "Your account";

  return (
    <div className="profile-button">
      <span className="profile-avatar">{getInitials(name) || "U"}</span>
      <span className="profile-copy">
        <strong>{name}</strong>
        <small>Signed in</small>
      </span>
      <button
        className="profile-signout"
        type="button"
        onClick={() => void signOut({ redirectTo: "/" })}
        aria-label="Sign out"
        title="Sign out"
      >
        ↪
      </button>
    </div>
  );
}
