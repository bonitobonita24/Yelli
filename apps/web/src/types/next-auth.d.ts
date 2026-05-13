import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      organizationId: string;
      role: "tenant_admin" | "host" | "participant";
      isSuperAdmin: boolean;
      securityVersion: number;
    };
  }
  interface User {
    id: string;
    email: string;
    organizationId: string;
    role: "tenant_admin" | "host" | "participant";
    isSuperAdmin: boolean;
    securityVersion: number;
    displayName: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    organizationId: string;
    role: "tenant_admin" | "host" | "participant";
    isSuperAdmin: boolean;
    securityVersion: number;
  }
}

// next-auth v5 re-exports JWT from @auth/core/jwt. Augmenting that module ensures
// the callback signatures in NextAuth() pick up our custom fields regardless of
// which entry point Auth.js resolves internally.
declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    organizationId: string;
    role: "tenant_admin" | "host" | "participant";
    isSuperAdmin: boolean;
    securityVersion: number;
  }
}
