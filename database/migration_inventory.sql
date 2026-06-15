-- ================================================================
-- Migration: 庫存追蹤系統（整合版）
--   1. inventory_movements  — 庫存異動帳（進貨/出貨/盤點）
--   2. products.safety_stock — 安全庫存門檻（低於即警示）
--   3. purchase_orders.stock_items / stocked_in — 採購入庫件數
--   4. kol_commissions.units_sold — KOL 開團出貨件數
--
-- 在 Supabase SQL Editor 執行此檔案（可重複執行）
-- ================================================================

-- ① 庫存異動帳
--   quantity 為「帶正負號的庫存變化量」：進貨 +、出貨 −、盤點 ±
--   目前庫存 = SUM(quantity)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type           VARCHAR(10) NOT NULL CHECK (type IN ('in', 'out', 'adjust')),
  channel        VARCHAR(20),                       -- 出貨通路：web/kol/b2b/sample/damage；進貨：restock
  quantity       INTEGER NOT NULL,                  -- 帶號：+進 / −出 / ±盤點
  unit_cost      NUMERIC(12,2),                     -- 進貨單價（選填）
  ref_type       VARCHAR(20),                       -- 來源：purchase_order / kol_commission / manual
  ref_id         UUID,                              -- 連結來源紀錄 id
  movement_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_date    ON inventory_movements(movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mov_ref     ON inventory_movements(ref_type, ref_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_movements_updated_at') THEN
    CREATE TRIGGER inventory_movements_updated_at
      BEFORE UPDATE ON inventory_movements
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ② 產品安全庫存門檻
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS safety_stock INTEGER NOT NULL DEFAULT 0;

-- ③ 採購單入庫件數
--   stock_items: [{"product_id":"...","product_name":"Glimmer","quantity":100}, ...]
--   stocked_in:  是否已入庫（true 時自動產生進貨異動）
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS stock_items JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stocked_in  BOOLEAN NOT NULL DEFAULT FALSE;

-- ④ KOL 開團出貨件數
ALTER TABLE kol_commissions
  ADD COLUMN IF NOT EXISTS units_sold INTEGER NOT NULL DEFAULT 0;

-- 註解
COMMENT ON TABLE  inventory_movements        IS '庫存異動帳：每筆進貨/出貨/盤點，目前庫存 = SUM(quantity)';
COMMENT ON COLUMN inventory_movements.quantity IS '帶正負號的庫存變化量：進貨 +、出貨 −、盤點 ±';
COMMENT ON COLUMN products.safety_stock      IS '安全庫存門檻，目前庫存低於此值即警示補貨';
COMMENT ON COLUMN purchase_orders.stock_items IS '入庫件數明細：[{product_id, product_name, quantity}]';
COMMENT ON COLUMN purchase_orders.stocked_in  IS '是否已入庫（true 自動產生進貨異動）';
COMMENT ON COLUMN kol_commissions.units_sold  IS 'KOL 開團實際出貨件數（自動產生出貨異動）';
