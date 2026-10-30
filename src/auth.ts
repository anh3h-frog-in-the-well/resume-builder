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
    async signIn({user, account, profile }) {
      // Insert or update user to database if user log in with google
      if (profile) {
        console.log('profile', profile.email, profile.name)
        const authUser = await findAuthUserByEmail(profile.email!);
        if (!authUser) {
          await createPasswordUser(profile.email!, profile.name!, await hashPassword(''));
        }
      }

      // allow sign in
      return true; 
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      console.log('session-session', session)
      console.log('session-token', token)
      if (session.user && token.sub) {
        // Make sure that userId is from database
        const authUser = await findAuthUserByEmail(token.email!);
        if (authUser) {
          session.user.id = authUser.id;
        } else {
          session.user.id = token.sub;
        }
      }
      return session;
    },
  },
});
