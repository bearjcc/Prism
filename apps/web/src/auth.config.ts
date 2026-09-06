import type { NextAuthConfig } from "next-auth";
import { authConfigured, buildAuthProviders } from "./lib/auth-providers";

export const authConfig: NextAuthConfig = {
  providers: buildAuthProviders(),
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    jwt({ token, account }) {
      if (account) {
        token.sub = account.providerAccountId;
        token.provider = account.provider;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.id;
        session.user.provider = typeof token.provider === "string" ? token.provider : undefined;
      }
      return session;
    },
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
};

export function signInEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return authConfigured(env);
}
