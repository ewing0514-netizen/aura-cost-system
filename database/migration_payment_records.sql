-- ================================================================
-- Migration: 新增貨款記錄功能（供應商 + 採購訂單）
-- 在 Supabase SQL Editor 執行此檔案
-- ================================================================

-- ================================
-- 供應商表
-- ================================
CREATE TABLE suppliers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(255) NOT NULL,
  contact_info TEXT,           -- 電話/LINE 等聯絡方式
  bank_account TEXT,           -- 預設匯款帳號
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================
-- 採購訂單（貨款記錄）表
-- ================================
CREATE TABLE purchase_orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  product_id          UUID REFERENCES products(id) ON DELETE SET NULL,  -- 選填
  item_description    TEXT NOT NULL,          -- 進貨品項描述
  invoice_no          VARCHAR(100),           -- 發票/單據編號
  total_amount        NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  deposit_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  deposit_paid_at     DATE,                   -- NULL = 訂金尚未付
  balance_paid_at     DATE,                   -- NULL = 尾款尚未付
  remittance_account  TEXT,                   -- 本次匯款帳號（可覆蓋供應商預設帳號）
  order_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  cancelled           BOOLEAN NOT NULL DEFAULT FALSE,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_date     ON purchase_orders(order_date DESC);

CREATE TRIGGER purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
