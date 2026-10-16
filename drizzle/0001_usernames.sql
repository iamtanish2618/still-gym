ALTER TABLE users ADD COLUMN username TEXT CHECK(username IS NULL OR (length(username) BETWEEN 3 AND 24 AND username NOT GLOB '*[^a-z0-9_]*'));
--> statement-breakpoint
CREATE UNIQUE INDEX users_username_unique ON users(username) WHERE username IS NOT NULL;
--> statement-breakpoint
CREATE INDEX tokens_expiry ON tokens(expires_at);
--> statement-breakpoint
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
