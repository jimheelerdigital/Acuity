import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { type NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";

import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

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
                await getResendClient().emails.send({
                  from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
                  to: email,
                  subject: "Sign in to Acuity",
                  html: magicLinkHtml(url),
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
        const { track } = await import("@/lib/posthog");
        // Start the 14-day Acuity trial clock. `trialEndsAt` is the
        // canonical trial timer — Stripe has no `trial_period_days`
        // on the checkout (plan §1.5 decision). `subscriptionStatus`
        // defaults to "TRIAL" on the schema; setting it explicitly
        // here too in case a migration ever changes that default.
        // IMPLEMENTATION_PLAN_PAYWALL §1.6.
        const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;
        const trialEndsAt = new Date(Date.now() + TRIAL_MS);
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: "TRIAL",
            trialEndsAt,
          },
        });

        // Kick off the paywall funnel.
        // IMPLEMENTATION_PLAN_PAYWALL §8.3.
        await track(user.id, "trial_started", {
          trialEndsAt: trialEndsAt.toISOString(),
          email: user.email ?? null,
        });

        await prisma.lifeMapArea.createMany({
          data: DEFAULT_LIFE_AREAS.map((area, index) => ({
            userId: user.id,
            area: area.enum,
            name: area.name,
            color: area.color,
            icon: area.icon,
            sortOrder: index,
          })),
        });
        // Initialize user memory
        await prisma.userMemory.create({
          data: { userId: user.id },
        }).catch(() => {}); // ignore if already exists
      },
    },
  };
}

// ─── Email template ───────────────────────────────────────────────────────────

function magicLinkHtml(url: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="background:#0D0D0F;margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#18181B;border-radius:16px;padding:40px;border:1px solid #27272A;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="width:48px;height:48px;background:linear-gradient(135deg,#7C3AED,#4F46E5);border-radius:12px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:24px;">✦</span>
      </div>
      <h1 style="color:#FAFAFA;font-size:24px;font-weight:700;margin:0;">Sign in to Acuity</h1>
    </div>
    <p style="color:#A1A1AA;font-size:15px;line-height:1.6;margin:0 0 32px;">
      Click the button below to sign in. This link expires in 24 hours and can only be used once.
    </p>
    <a href="${url}" style="display:block;background:linear-gradient(135deg,#7C3AED,#4F46E5);color:#FFFFFF;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-weight:600;font-size:15px;margin-bottom:24px;">
      Sign in to Acuity →
    </a>
    <p style="color:#52525B;font-size:13px;text-align:center;margin:0;">
      If you didn't request this link, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
}
