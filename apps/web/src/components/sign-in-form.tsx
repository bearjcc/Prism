"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const PROVIDER_LABELS: Record<"github" | "google", string> = {
  github: "GitHub",
  google: "Google",
};

type Props = {
  providers: Array<"github" | "google">;
  enabled: boolean;
};

export function SignInForm({ providers, enabled }: Props) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/explore";
  const authError = searchParams.get("error");

  if (!enabled) {
    return (
      <div className="stack">
        <p className="note">
          Sign-in is not configured on this deployment. Browse and install still work without an
          account.
        </p>
      </div>
    );
  }

  return (
    <div className="stack sign-in-providers">
      <p className="note">
        Sign in with GitHub or Google. Needed to comment, rate, or publish. Not needed to browse or
        install.
      </p>
      {authError ? (
        <p className="err" role="alert">
          Sign-in failed. Try again or use another provider.
        </p>
      ) : null}
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          className={`btn-solid oauth-btn oauth-${provider}`}
          onClick={() => signIn(provider, { callbackUrl })}
        >
          Sign in with {PROVIDER_LABELS[provider]}
        </button>
      ))}
    </div>
  );
}
