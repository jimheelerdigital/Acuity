import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { resolvePosthogConfig } from "./posthog";

describe("server PostHog key", () => {
  it("never captures with a personal key; falls back to the project key", () => {
    const c = resolvePosthogConfig({ POSTHOG_API_KEY: "phx_personal", NEXT_PUBLIC_POSTHOG_KEY: "phc_project" });
    expect(c.key).toBe("phc_project");
    expect(c.ignoredPersonalKey).toBe(true);
  });

  it("uses a project server key when set", () => {
    expect(resolvePosthogConfig({ POSTHOG_API_KEY: "phc_server", NEXT_PUBLIC_POSTHOG_KEY: "phc_project" }).key).toBe("phc_server");
  });

  it("no project key anywhere → disabled", () => {
    expect(resolvePosthogConfig({ POSTHOG_API_KEY: "phx_personal" }).key).toBeNull();
  });

  it("host: server host, else the client's absolute host, else US; never a relative proxy", () => {
    expect(resolvePosthogConfig({ NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" }).host).toBe("https://eu.i.posthog.com");
    expect(resolvePosthogConfig({ NEXT_PUBLIC_POSTHOG_HOST: "/ingest" }).host).toBe("https://us.i.posthog.com");
    expect(resolvePosthogConfig({ POSTHOG_HOST: "https://us.i.posthog.com", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" }).host).toBe("https://us.i.posthog.com");
  });
});
