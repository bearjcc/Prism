"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setSignedIn } from "./comments-panel";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSignedIn(true);
    router.push("/explore");
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
      </label>
      <label>
        Password
        <input type="password" required autoComplete="current-password" />
      </label>
      <p className="note">
        Fixture sign-in. No account is sent to a server. Browse and install still work signed out.
      </p>
      <button type="submit" className="btn-solid">
        Sign in
      </button>
    </form>
  );
}
