-- The application currently supports email/password accounts only.
ALTER TABLE account ADD COLUMN issuer text NOT NULL DEFAULT 'local:credential';
--> statement-breakpoint
CREATE UNIQUE INDEX account_issuer_account_id_unique ON account (issuer, account_id);
