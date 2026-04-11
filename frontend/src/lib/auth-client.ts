import { createAuthClient } from "better-auth/react";

const API_BASE = typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.PUBLIC_API_URL
  ? (import.meta as { env: Record<string, string> }).env.PUBLIC_API_URL
  : "http://localhost:8787";

export const authClient = createAuthClient({
  baseURL: API_BASE,
});

// Export auth methods (useSession is available as authClient.useSession - a Jotai atom)
export const { signIn, signUp, signOut } = authClient;
