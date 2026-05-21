/**
 * Delayed admin signup notification.
 *
 * Triggered 30 seconds after user creation so the set-attribution
 * endpoint has time to persist UTM data from the client-side cookie.
 * Queries the User row fresh — by this point attribution is usually
 * populated. If attribution is still empty after 30s, sends anyway
 * with "direct" source — never skips the notification.
 *
 * The welcome email to the USER stays immediate (fires at bootstrap).
 * Only the ADMIN notification is delayed.
 */

import { inngest } from "@/inngest/client";

export const sendSignupNotificationFn = inngest.createFunction(
  {
    id: "send-signup-notification",
    name: "Send admin signup notification (delayed for attribution)",
    triggers: [{ event: "user/signup.notify" }],
  },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };

    // Wait 30 seconds for set-attribution to fire
    await step.sleep("wait-for-attribution", "30s");

    // Fetch the user fresh — attribution should be populated by now
    const user = await step.run("fetch-user", async () => {
      const { prisma } = await import("@/lib/prisma");
      return prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          isFoundingMember: true,
          foundingMemberNumber: true,
          trialEndsAt: true,
          createdAt: true,
          signupUtmSource: true,
          signupUtmMedium: true,
          signupUtmCampaign: true,
          signupUtmContent: true,
          signupUtmTerm: true,
          signupReferrer: true,
          signupLandingPath: true,
          signupMethod: true,
        },
      });
    });

    if (!user) {
      return { skipped: true, reason: "user not found (may have been deleted)" };
    }

    // signupMethod is written to the User row by each signup route handler
    const signupMethod = user.signupMethod || "unknown";

    const trialDays = user.trialEndsAt
      ? Math.round(
          (user.trialEndsAt.getTime() - user.createdAt.getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : 30;

    // Send the notification
    await step.run("send-notification", async () => {
      const { notifyFoundersOfSignup } = await import(
        "@/lib/founder-notifications"
      );
      await notifyFoundersOfSignup({
        userId: user.id,
        email: user.email,
        isFoundingMember: user.isFoundingMember ?? false,
        foundingMemberNumber: user.foundingMemberNumber ?? null,
        trialDays,
        attribution: {
          utmSource: user.signupUtmSource ?? undefined,
          utmMedium: user.signupUtmMedium ?? undefined,
          utmCampaign: user.signupUtmCampaign ?? undefined,
          utmContent: user.signupUtmContent ?? undefined,
          utmTerm: user.signupUtmTerm ?? undefined,
          referrer: user.signupReferrer ?? undefined,
          landingPath: user.signupLandingPath ?? undefined,
        },
        signupMethod,
      });
    });

    return {
      sent: true,
      email: user.email,
      signupMethod,
      hadAttribution: Boolean(user.signupUtmSource || user.signupUtmCampaign),
    };
  }
);
