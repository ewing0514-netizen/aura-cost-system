-- ================================================================
-- Migration: 系統 / 其他支出記錄
--   配合「現金財務記錄」新增支出分三類：貨款 / 系統相關 / 其他
--   貨款 = purchase_orders（既有）；本表存系統與其他支出
--
-- 在 Supabase SQL Editor 執行此檔案（可重複執行）
-- ================================================================

CREATE TABLE IF NOT EXISTS expense_records (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category       VARCHAR(20)  NOT NULL DEFAULT 'other',      -- 'system' 系統相關 | 'other' 其他
  label          VARCHAR(100),                               -- 子類別：雲端費用 / AI系統費用 / 行銷工具 ...
  name           VARCHAR(255) NOT NULL,                      -- 項目描述，例：AWS EC2、ChatGPT Team
  vendor         VARCHAR(255),                               -- 廠商，例：AWS、OpenAI
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date   DATE NOT NULL DEFAULT CURRENT_DATE,         -- 首次/該筆支出日期
  recurring      BOOLEAN NOT NULL DEFAULT FALSE,             -- 每月固定（訂閱），true 則每月支出自動計入
  payment_method VARCHAR(50),
  cancelled      BOOLEAN NOT NULL DEFAULT FALSE,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_records_date     ON expense_records(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expense_records_category ON expense_records(category);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'expense_records_updated_at') THEN
    CREATE TRIGGER expense_records_updated_at
      BEFORE UPDATE ON expense_records
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE  expense_records           IS '系統 / 其他支出（貨款以外的共用支出）';
COMMENT ON COLUMN expense_records.category  IS 'system 系統相關 | other 其他';
COMMENT ON COLUMN expense_records.recurring IS '每月固定訂閱，true 則每月支出統計自動計入';
