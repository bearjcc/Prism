import type { Metadata } from "next";
import { SignInForm } from "../../components/sign-in-form";
import { SiteShell } from "../../components/site-shell";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <SiteShell current="signin">
      <div className="page-head">
        <h1>Sign in</h1>
        <p>Needed to comment, rate, or publish. Not needed to browse or install.</p>
      </div>
      <SignInForm />
    </SiteShell>
  );
}
