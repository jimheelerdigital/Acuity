import { PrismaAdapter } from "@auth/prisma-adapter";
import { type NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import GoogleProvider from "next-auth/providers/google";

import { prisma } from "@/lib/prisma";
import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

export const authOptions: NextAuthOptions = {
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

    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
      // Custom magic link email template
      sendVerificationRequest: async ({ identifier: email, url, provider }) => {
        const { createTransport } = await import("nodemailer");
        const transport = createTransport(provider.server);
        await transport.sendMail({
          to: email,
          from: provider.from,
          subject: "Sign in to Acuity",
          text: `Sign in to Acuity\n\nClick the link below to sign in:\n${url}\n\nThis link expires in 24 hours.\n\nIf you didn't request this, you can safely ignore this email.`,
          html: magicLinkHtml(url),
        });
      },
    }),
  ],

  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
    error: "/auth/error",
  },

  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },

  events: {
    /** Seed default life map areas on first sign-up */
    async createUser({ user }) {
      await prisma.lifeMapArea.createMany({
        data: DEFAULT_LIFE_AREAS.map((area, index) => ({
          userId: user.id,
          name: area.name,
          color: area.color,
          icon: area.icon,
          sortOrder: index,
        })),
      });
    },
  },
};

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
