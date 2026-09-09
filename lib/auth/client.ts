import { createAuthClient } from "better-auth/react";

/** Browser-side auth client. The base URL defaults to the current origin. */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
