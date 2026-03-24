-- CreateTable
CREATE TABLE "corridor_threshold_rules" (
    "id" TEXT NOT NULL,
    "corridor_code" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "threshold_amount" DECIMAL(18,2),
    "threshold_type" TEXT NOT NULL,
    "threshold_max" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "detail_template" TEXT NOT NULL,
    "regulation_ref" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corridor_threshold_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_corridor_rule_unique" ON "corridor_threshold_rules"("corridor_code", "rule_id");

-- CreateIndex
CREATE INDEX "corridor_threshold_rules_corridor_code_is_active_idx" ON "corridor_threshold_rules"("corridor_code", "is_active");

-- AddForeignKey
ALTER TABLE "corridor_threshold_rules" ADD CONSTRAINT "corridor_threshold_rules_corridor_code_fkey" FOREIGN KEY ("corridor_code") REFERENCES "institution_corridors"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
