import "server-only";

import { auth } from "@clerk/nextjs/server";

function getApiBaseUrl(): string {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error(
      "API_BASE_URL or NEXT_PUBLIC_API_BASE_URL is required to sync the authenticated user."
    );
  }

  return apiBaseUrl.replace(/\/$/, "");
}

export async function syncAuthenticatedUser(): Promise<void> {
  const { userId, getToken } = await auth();

  if (!userId) {
    return;
  }

  const token = await getToken();

  if (!token) {
    throw new Error("Unable to read the active Clerk session token.");
  }

  const response = await fetch(`${getApiBaseUrl()}/api/v1/users/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Authenticated user sync failed with status ${response.status}.`
    );
  }
}
