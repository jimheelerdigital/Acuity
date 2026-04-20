# Content Factory

The Content Factory automatically generates daily content (blog posts, tweets, TikTok scripts, and ad copy) using Claude Opus, informed by a daily research briefing pulled from Reddit and GA4. A human reviews and approves everything at `/admin/content-factory` before anything goes live.

## Triggering a Manual Generation

1. **Admin UI:** Go to `/admin/content-factory` and click the "Generate Now" button in the top right.
2. **Inngest Dev UI:** Navigate to the Inngest dashboard and manually invoke the `content-factory-generate` function.

## Adding New Content Types

1. Add the new value to the `ContentType` enum in `prisma/schema.prisma` and run `npx prisma generate`.
2. Create a new generator function in `generate.ts` following the pattern of the existing ones (use `callClaude` wrapper, return `{ hook, body, cta, predictedScore }`).
3. Call the new generator in `apps/web/src/inngest/functions/content-factory.ts` inside the `generateDailyFn` `Promise.all` block.
4. Add the new type to the `TYPE_ORDER` and `TYPE_COLORS` arrays in `content-factory-client.tsx`.

## Cost Monitoring

All Claude API calls are logged to the `ClaudeCallLog` table with token counts and computed costs. The main admin dashboard at `/admin/dashboard` shows a "AI spend this month" widget that sums `costCents` for the current calendar month against a $100 budget. To reset or adjust the budget threshold, update the `10000` cent value in `admin-dashboard-client.tsx`.
