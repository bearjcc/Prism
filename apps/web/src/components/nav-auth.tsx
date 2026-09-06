"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useWebSession } from "../lib/web-session";

type Props = {
  current?: string;
};

export function NavAuth({ current }: Props) {
  const { authenticated, loading, user } = useWebSession();

  if (loading) {
    return null;
  }

  if (authenticated) {
    const label = user?.name ?? user?.email ?? "Signed in";
    return (
      <>
        <span className="nav-user" title={user?.email ?? undefined}>
          {label}
        </span>
        <button
          type="button"
          className="ghost nav-sign-out"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          Sign out
        </button>
      </>
    );
  }

  return (
    <Link href="/signin" aria-current={current === "signin" ? "page" : undefined}>
      Sign in
    </Link>
  );
}
