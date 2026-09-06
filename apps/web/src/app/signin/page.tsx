import type { Metadata } from "next";
import { Suspense } from "react";
import { signInEnabled } from "../../auth.config";
import { SignInForm } from "../../components/sign-in-form";
import { SiteShell } from "../../components/site-shell";
import { configuredProviderIds } from "../../lib/auth-providers";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const providers = configuredProviderIds();
  const enabled = signInEnabled();

  return (
    <SiteShell current="signin">
      <div className="page-head">
        <h1>Sign in</h1>
        <p>Needed to comment, rate, or publish. Not needed to browse or install.</p>
      </div>
      <Suspense fallback={<p className="note">Loading sign-in...</p>}>
        <SignInForm providers={providers} enabled={enabled} />
      </Suspense>
    </SiteShell>
  );
}
