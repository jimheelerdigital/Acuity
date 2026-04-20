import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";

import { magicLinkEmail } from "@/emails/magic-link";
import { verifyPassword } from "@/lib/passwords";
import { checkRateLimit, limiters } from "@/lib/rate-limit";

/**
 * Returns NextAuth options with prisma lazily imported.
 * Never call this at module scope — only inside request handlers or
 * async server functions, so prisma is never instantiated at build time.
 */
export function getAuthOptions(): NextAuthOptions {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { prisma } = require("@/lib/prisma") as { prisma: PrismaClient };

  return {
    adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],

    providers: [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        authorization: {
          params: {
            prompt: "consent",
            access_type: "offline",
            response_type: "code",
          },
        },
      }),

      // Email/password sign-in. The corresponding signup flow lives at
      // POST /api/auth/signup (NextAuth's Credentials provider doesn't
      // create users — authorize() only authenticates existing ones).
      //
      // Throws specific errors so the UI can distinguish between
      // "wrong password" and "email not verified" cases. NextAuth
      // surfaces these as error codes on the /auth/signin?error= URL.
      CredentialsProvider({
        id: "credentials",
        name: "Email and password",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(creds) {
          const email = typeof creds?.email === "string" ? creds.email.toLowerCase().trim() : "";
          const password = typeof creds?.password === "string" ? creds.password : "";
          if (!email || !password) return null;

          // Per-email rate limit (5/hour) — prevents online password
          // guessing against one account even if the attacker rotates
          // IPs. Throws a specific error so the UI can message it.
          const rl = await checkRateLimit(limiters.authByEmail, `credentials:${email}`);
          if (!rl.success) {
            throw new Error("RateLimited");
          }

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              passwordHash: true,
              emailVerified: true,
            },
          });
          if (!user || !user.passwordHash) {
            // Generic null — don't leak which half of the credential
            // pair was wrong. Same response whether the user doesn't
            // exist or only has a Google Account row.
            return null;
          }

          const match = await verifyPassword(password, user.passwordHash);
          if (!match) return null;

          if (!user.emailVerified) {
            throw new Error("EmailNotVerified");
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        },
      }),

      // Only register the email provider when the Resend API key is configured —
      // missing key would crash NextAuth init and block Google sign-in too.
      ...(process.env.RESEND_API_KEY
        ? [
            EmailProvider({
              server: {
                host: "smtp.resend.com",
                port: 465,
                auth: {
                  user: "resend",
                  pass: process.env.RESEND_API_KEY ?? "",
                },
              },
              from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
              sendVerificationRequest: async ({
                identifier: email,
                url,
              }) => {
                const { getResendClient } = await import("@/lib/resend");
                const { subject, html } = magicLinkEmail(url);
                await getResendClient().emails.send({
                  from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
                  to: email,
                  subject,
                  html,
                });
              },
            }),
          ]
        : []),
    ],

    session: {
      strategy: "jwt",
      // 30-day session token, refreshed on use (NextAuth default).
      // SECURITY_AUDIT.md §6.1: reasonable for a consumer app with
      // no financial-dashboard surface; revisit if we add high-risk
      // actions (bulk deletes, data exports).
      maxAge: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60, // refresh the token daily on active use
    },
    cookies: {
      // NextAuth defaults are already correct (HttpOnly, SameSite=Lax,
      // Secure=true in prod). Declaring them explicitly here makes
      // the posture auditable in the repo, not just assumed from the
      // library's defaults.
      sessionToken: {
        name:
          process.env.NODE_ENV === "production"
            ? "__Secure-next-auth.session-token"
            : "next-auth.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production",
        },
      },
    },

    pages: {
      signIn: "/auth/signin",
      verifyRequest: "/auth/verify",
      error: "/auth/error",
    },

    callbacks: {
      async jwt({ token, user }) {
        // On initial sign-in, user is the DB record from the adapter
        if (user) {
          token.id = user.id;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.id) {
          session.user.id = token.id as string;
        }
        return session;
      },
    },

    events: {
      async createUser({ user }) {
        // Trial clock + LifeMapArea seed + UserMemory + trial_started
        // PostHog event. Shared with /api/auth/mobile-callback so the
        // native OAuth path produces identical state; see lib/bootstrap-user.ts.
        const { bootstrapNewUser } = await import("@/lib/bootstrap-user");
        await bootstrapNewUser({ userId: user.id, email: user.email ?? null });
      },
    },
  };
}

