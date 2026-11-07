import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

// Export auth methods (useSession is available as authClient.useSession - a Jotai atom)
export const { signIn, signUp, signOut } = authClient;
