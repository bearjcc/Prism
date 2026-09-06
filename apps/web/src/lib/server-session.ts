import { auth } from "../auth";

export async function getServerSession() {
  return auth();
}

export async function isServerAuthenticated(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user?.id);
}
