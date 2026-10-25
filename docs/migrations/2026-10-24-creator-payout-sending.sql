-- 2026-10-24: payout "sending" state (claimed by an execute; a Stripe
-- transfer may already exist). Additive. Apply BEFORE deploying the code.
ALTER TYPE "CreatorPayoutStatus" ADD VALUE IF NOT EXISTS 'sending' BEFORE 'sent';
