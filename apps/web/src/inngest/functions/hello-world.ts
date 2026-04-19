import { inngest } from "@/inngest/client";

export const helloWorldFn = inngest.createFunction(
  {
    id: "hello-world",
    name: "Hello world (bootstrap smoke test)",
    triggers: [{ event: "test/hello" }],
  },
  async ({ event, step }) => {
    const message =
      (event.data as { message?: string } | undefined)?.message ?? "(no message)";

    const greeting = await step.run("log-greeting", () => {
      const line = `Hello from Inngest: ${message}`;
      console.log(`[inngest:hello-world] ${line}`);
      return line;
    });

    return { ok: true, greeting, receivedAt: new Date().toISOString() };
  }
);
