import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";

export function oauthProviderConfigured(
  clientId?: string,
  clientSecret?: string,
): boolean {
  return Boolean(clientId?.trim() && clientSecret?.trim());
}

export function buildAuthProviders(
  env: Record<string, string | undefined> = process.env,
): Provider[] {
  const providers: Provider[] = [];

  if (oauthProviderConfigured(env.AUTH_GITHUB_ID, env.AUTH_GITHUB_SECRET)) {
    providers.push(
      GitHub({
        clientId: env.AUTH_GITHUB_ID!,
        clientSecret: env.AUTH_GITHUB_SECRET!,
      }),
    );
  }

  if (oauthProviderConfigured(env.AUTH_GOOGLE_ID, env.AUTH_GOOGLE_SECRET)) {
    providers.push(
      Google({
        clientId: env.AUTH_GOOGLE_ID!,
        clientSecret: env.AUTH_GOOGLE_SECRET!,
      }),
    );
  }

  return providers;
}

export function authConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.AUTH_SECRET?.trim()) && buildAuthProviders(env).length > 0;
}

export function configuredProviderIds(
  env: Record<string, string | undefined> = process.env,
): Array<"github" | "google"> {
  const ids: Array<"github" | "google"> = [];
  if (oauthProviderConfigured(env.AUTH_GITHUB_ID, env.AUTH_GITHUB_SECRET)) {
    ids.push("github");
  }
  if (oauthProviderConfigured(env.AUTH_GOOGLE_ID, env.AUTH_GOOGLE_SECRET)) {
    ids.push("google");
  }
  return ids;
}
