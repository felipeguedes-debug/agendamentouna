import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

/** Inngest calls the background jobs here (src/lib/inngest/functions.ts). */

// A job is one request: a Google read or a practice's export takes more than a page does.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
