-- Add account_hash column to user table for looking up emails by guardian account hash
-- Run this in your Supabase SQL Editor

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS account_hash TEXT;

-- Create index for faster lookups by account_hash
CREATE INDEX IF NOT EXISTS idx_user_account_hash ON "user" (account_hash);

-- Optional: Update existing users to have account_hash
-- (This requires manual mapping since we can't compute account_hash without the SDK)
-- New users will automatically have account_hash when they submit their email
