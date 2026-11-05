import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";

// Better Auth's endpoints (/api/auth/*). Sign-in, two-factor and session renewal
// run here, where the cookie can be set and the rate limiter applies (D-37).
export const { GET, POST } = toNextJsHandler(auth);
