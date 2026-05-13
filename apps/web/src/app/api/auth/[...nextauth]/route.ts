// Non-tRPC route handler — auth callbacks bypass tRPC middleware.
// Auth.js v5 handlers are self-contained; no manual auth check needed here
// because this IS the auth endpoint (the handlers perform the auth logic).
import { handlers } from "@/server/auth";

export const { GET, POST } = handlers;
