-- Add enabled column to existing ops_discord_channels table
-- (Table was created by a prior migration or manual setup)

ALTER TABLE ops_discord_channels
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
