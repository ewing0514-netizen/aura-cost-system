-- ================================================================
-- Migration: 採購訂單擴充欄位
--   1. extra_expenses    -- 其他支出明細（運費、報關費等，JSONB array）
--   2. operating_fee_pct -- 公司運營費 %（預設 15%）
--   3. public_fund_amount -- 公基金 NT$（每案可選，預設 0）
--
-- 在 Supabase SQL Editor 執行此檔案（可重複執行）
-- ================================================================

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS extra_expenses     JSONB         NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operating_fee_pct  NUMERIC(5,2)  NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS public_fund_amount NUMERIC(12,2) NOT NULL DEFAULT 0
       CHECK (public_fund_amount >= 0);

-- 註解
COMMENT ON COLUMN purchase_orders.extra_expenses     IS '其他支出明細：[{"name":"運費","amount":500}, ...]';
COMMENT ON COLUMN purchase_orders.operating_fee_pct  IS '公司運營費百分比，套用於（總金額 + 其他支出）';
COMMENT ON COLUMN purchase_orders.public_fund_amount IS '公基金 NT$ 提撥金額（每案可選）';
