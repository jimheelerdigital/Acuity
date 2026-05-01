# Incident — Anthropic API Key Leak (2026-04-30)

**Severity:** High (production credential exposed)
**Status:** Resolved. Old key revoked; new key deployed to all three locations; production redeploy succeeded.

## Summary

While investigating Phase 2 of the theme-extraction redesign, I (Claude) ran a `grep` against `.env.local` files to confirm `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` were present. I attempted to redact the key value with a `sed` substitution before letting the output reach the conversation. The redaction pattern was wrong, the substitution silently no-op'd, and the **full live `ANTHROPIC_API_KEY` value printed in the tool output** — which is captured in conversation transcripts and harness logs.

The user immediately revoked the leaked key, generated a new one, and dropped it at `/tmp/new-anthropic-key` for me to rotate.

## Root cause — why the redaction failed

The command was:

```bash
grep -E "^(ANTHROPIC_API_KEY|CLAUDE_MODEL)" .env.local apps/web/.env.local \
  | sed -E 's/=(sk-[^"]{6}).*/=\1***REDACTED/'
```

The intent was: match `=sk-` followed by 6 characters, capture those 6, drop the rest, append `***REDACTED`.

The bug: Anthropic API keys begin with the literal prefix **`sk-ant-api03-`** which is **already 13 characters after `sk-`**, not 6. The regex `sk-[^"]{6}` matched the first 6 characters after `sk-` (`ant-ap`), which is fine on its own — but `=\1` in the replacement only kept those 6, and the trailing `***REDACTED` was appended after them, with the rest of the line — i.e. the body of the secret — already truncated *only if `.*` matched a closing quote*.

Tracing it more precisely: the actual value in the file looks like `ANTHROPIC_API_KEY="sk-ant-api03-mdkSSdfj...UujA-7-ZmNAAA"`. The regex `=(sk-[^"]{6}).*` is anchored to `=`, so it expected `=sk-...`. But the value in the file is `="sk-...` — the `=` is followed by a quote, not by `s`. **The regex never matched at all.** sed silently emitted the input unchanged. The full key flowed through to stdout and into the tool result.

This is the worst class of redaction bug: a regex that doesn't match produces no warning, no error, no "unmatched" indicator. The shell doesn't know the redaction was supposed to happen. The output looks like a normal grep result.

## What I should have done

Three layers of defense were available; I used zero.

1. **Don't surface secret-bearing files in tool output at all.** I didn't need to *see* the key value — only confirm the variable exists. `grep -c "^ANTHROPIC_API_KEY=" .env.local` returns `1` or `0`. That answers the question with zero exposure.

2. **If I must read the file, redact at the source, not as a post-pipe filter.** A separate redaction script (in a file, with tests) is harder to get wrong than an inline sed. The Python script `/tmp/rotate-anthropic-key.py` I wrote for the rotation never put the key in argv, env, or stdout at any point — that's the pattern.

3. **Verify redaction worked before trusting it.** A redaction that emits unchanged input on regex miss is unsafe by default. The pattern should have been: read into a variable in shell, check the line matched the expected prefix, then echo only a safe summary like `length=121`. Failing closed instead of failing open.

## What I changed

### Auto-memory entry
Adding a feedback memory so future sessions inherit the rule. See: `feedback_secret_handling.md`.

### Operational rules I'll follow going forward

- **Never grep, cat, head, or tail an `.env*` file** without thinking about whether the answer requires the value. If the answer is "does this var exist", use `grep -c` or `grep -q`.
- **Never use inline sed/awk redaction on secret-bearing pipelines.** Inline regex redaction is fail-open. If a file might contain secrets, write a redaction filter in a real script with explicit asserts ("if no match, exit 1") so silent failures become loud.
- **When a secret is needed for a tool call, source it from a file via stdin or env, never argv.** Examples: `tr -d '\n' < /tmp/key | curl --data-binary @-`, or `export FOO=$(cat /tmp/key) && python3 -c '...os.environ["FOO"]...'`.
- **Verify by length, not value.** `wc -c file` and "expected ~121, got 121 ✓" is a complete verification. Reading file content for confirmation re-creates the leak risk.

## Rotation log (this incident)

| Step | Action | Verification |
|---|---|---|
| 1 | User revoked old key in Anthropic Console | confirmed by user |
| 2 | User wrote new key to `/tmp/new-anthropic-key` (mode 0600, 122 bytes) | `wc -c` + `stat -f '%p'` |
| 3 | Wrote `/tmp/rotate-anthropic-key.py` (Python; reads key from file, never from argv/env/stdout) | script reviewed |
| 4 | Rotated `/Users/jcunningham525/projects/Acuity/.env.local` | size delta +13 bytes |
| 5 | Rotated `/Users/jcunningham525/projects/Acuity/apps/web/.env.local` | size delta +13 bytes |
| 6 | `vercel env rm ANTHROPIC_API_KEY production --yes` | "Removed Environment Variable" |
| 7 | `vercel env rm` for preview + development | "env_not_found" — Vercel removed all scopes in step 6 |
| 8 | `tr -d '\n' < /tmp/new-anthropic-key \| vercel env add ANTHROPIC_API_KEY production` | "Added Environment Variable" |
| 9 | Vercel REST API POST to `/v10/projects/.../env` for `target=["preview"]` (CLI prompted interactively for branch scope, so used the API to apply to all preview branches) | response: `created.id`, `target=['preview']`, `gitBranch=None` |
| 10 | `vercel env ls` | shows two rows: Production + Preview (Development intentionally not restored — local dev uses `.env.local`) |
| 11 | `vercel redeploy https://acuity-36kc64v6j-keypicksems-projects.vercel.app` | Aliased to `app.getacuity.io` |
| 12 | `rm -f /tmp/new-anthropic-key /tmp/rotate-anthropic-key.py` | both gone |

## Loose ends for the user

- **Vercel Development scope** is now empty for this var. If you run `vercel dev` locally, it'll fall back to `apps/web/.env.local` which is correct. If you specifically need it in the Vercel-side dev scope, add it manually.
- **EAS / mobile** doesn't carry `ANTHROPIC_API_KEY` (extraction runs server-side); no mobile rebuild needed.
- **Anthropic Console → Usage**: worth a glance to confirm there's no anomalous spend on the old key between leak and revocation.
- **Conversation transcript**: the exposed key is in the harness log for this session. Once revoked, the leaked value is inert, but treat session logs/exports for this conversation as containing a former-secret artifact.
