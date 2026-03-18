-- Enforce only one active default account per client
CREATE UNIQUE INDEX "institution_accounts_one_default_active_idx"
  ON "institution_accounts" ("client_id")
  WHERE "is_default" = true AND "is_active" = true;
