import { describe, expect, it } from "vitest";

import { APP_STORE_URL, PLAY_STORE_URL, releaseAnnouncement } from "./release";
import { RELEASE_EMAILS, releaseEmailFor } from "./releases";

const vars = { firstName: "Sam", unsubscribeUrl: "https://goripple.io/api/emails/unsubscribe?token=t" };

describe("release announcement emails", () => {
  it("has a 1.9.5 entry and renders it", () => {
    const r = releaseEmailFor("1.9.5");
    expect(r?.platform).toBe("ios");
    const { subject, html } = releaseAnnouncement(r!, vars);
    expect(subject).toContain("1.9.5");
    expect(html).toContain("Hi Sam,");
    expect(html).toContain(APP_STORE_URL);
    expect(html).toContain("Type it instead");
    expect(html).toContain(vars.unsubscribeUrl);
  });

  it("points Android releases at Google Play", () => {
    const { html } = releaseAnnouncement({ ...RELEASE_EMAILS[0], platform: "android" }, vars);
    expect(html).toContain(PLAY_STORE_URL);
    expect(html).toContain("Update in Google Play");
  });

  it("escapes the first name", () => {
    const { html } = releaseAnnouncement(RELEASE_EMAILS[0], { ...vars, firstName: "<b>x</b>" });
    expect(html).not.toContain("<b>x</b>");
  });

  it("never talks billing plumbing or analytics to users", () => {
    const copy = JSON.stringify(RELEASE_EMAILS);
    expect(copy).not.toMatch(/revenuecat|revenue cat|analytics|install id|meta sdk|tracking|inngest/i);
  });

  it("one entry per version", () => {
    const versions = RELEASE_EMAILS.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
