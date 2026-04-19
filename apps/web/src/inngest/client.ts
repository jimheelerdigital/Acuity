import { Inngest } from "inngest";

/**
 * Singleton Inngest client. App ID "acuity" is stable — Inngest uses it to
 * track function versions, so changing it orphans in-flight work.
 *
 * Event-type schemas will be added incrementally as each PR lands a new
 * function (see INNGEST_MIGRATION_PLAN.md §3). For now PR 1 only has the
 * `test/hello` smoke-test event, which is loosely typed through the
 * handler's `event.data` below.
 */
export const inngest = new Inngest({ id: "acuity" });
