import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createPasswordUser, findAuthUserByEmail } from "./service/auth-service";
import { hashPassword, verifyPassword } from "./lib/password";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (
          typeof credentials.email !== "string" ||
          credentials.email.length > 320 ||
          typeof credentials.password !== "string" ||
          credentials.password.length < 8 ||
          credentials.password.length > 128
        ) {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();
        const user = await findAuthUserByEmail(email);
        if (!user?.passwordHash) return null;
        if (!(await verifyPassword(credentials.password, user.passwordHash))) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID as string,
      clientSecret: process.env.AUTH_GOOGLE_SECRET as string,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {

    // Handle sign in with google
    async signIn({ profile }) {
      // Insert or update user to database if user log in with google
      if (profile) {
        const authUser = await findAuthUserByEmail(profile.email!);
        if (!authUser) {
          await createPasswordUser(profile.email!, profile.name!, await hashPassword(''));
        }
      }

      // allow sign in
      return true; 
    },
    async jwt({ token, user, account }) {
      if (user?.id) token.sub = user.id;

      // Resolve the database account once, when the token is issued, instead
      // of on every request. The credentials provider already returns the
      // account id; Google returns its own subject, so look the account up
      // by email (the signIn callback has created it by now). Tokens issued
      // before this field existed are upgraded the first time they are seen.
      if (account?.provider === "credentials" && user?.id) {
        token.accountId = user.id;
      } else if (!token.accountId && typeof token.email === "string") {
        try {
          const authUser = await findAuthUserByEmail(token.email);
          if (authUser) token.accountId = authUser.id;
        } catch (error) {
          console.error("Unable to resolve the account for this session.", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        // Fall back to the token subject so a session stays valid even if the
        // account could not be resolved when the token was issued.
        session.user.id = token.accountId ?? token.sub;
      }
      return session;
    },
  },
});
