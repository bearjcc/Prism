"use client";

import { useSession } from "next-auth/react";

export type WebSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  provider?: string;
};

export type WebSessionState = {
  authenticated: boolean;
  loading: boolean;
  user: WebSessionUser | null;
};

export function useWebSession(): WebSessionState {
  const { data, status } = useSession();
  const user = data?.user;

  return {
    authenticated: status === "authenticated" && Boolean(user?.id),
    loading: status === "loading",
    user: user?.id
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          provider: user.provider,
        }
      : null,
  };
}
