"use client";

import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [router, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isRegistering) {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const payload: unknown = await response.json();
        if (
          !response.ok ||
          typeof payload !== "object" ||
          payload === null ||
          !("ok" in payload)
        ) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Unable to create your account.";
          throw new Error(message);
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (!result.ok) {
        throw new Error(
          isRegistering
            ? "Account created, but sign-in failed. Please sign in."
            : "Email or password is incorrect.",
        );
      }
      const requestedPath = new URLSearchParams(window.location.search).get(
        "callbackUrl",
      );
      const redirectPath =
        requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
          ? requestedPath
          : "/";
      router.replace(redirectPath);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <Link className="auth-brand" href="/">
          <span className="brand-mark">CV</span>
          <span>Resume builder<span className="brand-period">.</span></span>
        </Link>
        <p className="auth-eyebrow">YOUR RESUME WORKSPACE</p>
        <h1 id="auth-heading">
          {isRegistering ? "Create your account" : "Welcome back"}
        </h1>
        <p className="auth-description">
          {isRegistering
            ? "Save your resume and pick up where you left off."
            : "Sign in to access your saved resume."}
        </p>

        <div className="auth-divider"><span>EMAIL AND PASSWORD</span></div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegistering && (
            <label>
              <span>Name</span>
              <input
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
          )}
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={320}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={isRegistering ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={isRegistering ? 8 : undefined}
              maxLength={128}
              required
            />
            {isRegistering && (
              <small>Use at least 8 characters.</small>
            )}
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Please wait..."
              : isRegistering
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        
        {!isRegistering && <div>
                <div className="auth-divider"><span>Or</span></div>
                  <div className="auth-form">
                    <button className="auth-submit" onClick={() => signIn('google')}>Sign in with Google</button>
                </div>
            </div>
        }
       
        <p className="auth-toggle">
          {isRegistering ? "Already have an account?" : "New to Resume builder?"}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setIsRegistering((current) => !current);
            }}
          >
            {isRegistering ? "Sign in" : "Create an account"}
          </button>
        </p>
      </section>
    </main>
  );
}
