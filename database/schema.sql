-- ================================
-- AURA 產品成本管理系統 Database Schema
-- Supabase PostgreSQL
-- ================================

-- 啟用 UUID 擴充
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================
-- 成本項目類別
-- ================================
CREATE TYPE cost_category AS ENUM (
  'material',   -- 原料/材料成本
  'labor',      -- 人工/勞務成本
  'packaging',  -- 包裝/運輸成本
  'fixed',      -- 其他固定成本
  'other'       -- 其他
);

-- ================================
-- 售價類別
-- ================================
CREATE TYPE price_type AS ENUM (
  'normal',     -- 常態價
  'promotion',  -- 優惠價/活動價
  'group',      -- 團購價
  'member',     -- 會員價/分銷價
  'suggested',  -- 建議售價（市場建議定價）
  'custom'      -- 自訂
);

-- ================================
-- 產品主表
-- ================================
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================
-- 成本項目表
-- ================================
CREATE TABLE cost_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,  -- NULL = 全域成本
  name        VARCHAR(255) NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  amount_type VARCHAR(10)  NOT NULL DEFAULT 'fixed' CHECK (amount_type IN ('fixed', 'percentage')),
  category    cost_category NOT NULL DEFAULT 'other',
  cost_type   VARCHAR(10)  NOT NULL DEFAULT 'variable' CHECK (cost_type IN ('variable', 'fixed')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_items_product_id ON cost_items(product_id);
CREATE INDEX idx_cost_items_category   ON cost_items(category);

-- ================================
-- 售價設定表
-- ================================
CREATE TABLE price_tiers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  price_type  price_type NOT NULL DEFAULT 'custom',
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_tiers_product_id ON price_tiers(product_id);

-- ================================
-- 自動更新 updated_at 觸發器
-- ================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER cost_items_updated_at
  BEFORE UPDATE ON cost_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER price_tiers_updated_at
  BEFORE UPDATE ON price_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================
-- 損益分析 View
-- 計算每個產品在各售價方案下的損益平衡點與利潤
-- ================================
CREATE VIEW product_price_analysis AS
SELECT
  p.id                    AS product_id,
  p.name                  AS product_name,
  pt.id                   AS price_tier_id,
  pt.name                 AS price_name,
  pt.price_type,
  pt.amount               AS selling_price,

  -- 總成本（固定金額 + 百分比×售價）
  COALESCE(SUM(
    CASE
      WHEN ci.amount_type = 'percentage' THEN ci.amount / 100.0 * pt.amount
      ELSE ci.amount
    END
  ), 0) AS total_cost,

  -- 可變成本（cost_type = 'variable'）
  COALESCE(SUM(
    CASE
      WHEN ci.amount_type = 'percentage' THEN ci.amount / 100.0 * pt.amount
      ELSE ci.amount
    END
  ) FILTER (WHERE COALESCE(ci.cost_type, 'variable') = 'variable'), 0) AS variable_cost,

  -- 固定成本（cost_type = 'fixed'）
  COALESCE(SUM(
    CASE
      WHEN ci.amount_type = 'percentage' THEN ci.amount / 100.0 * pt.amount
      ELSE ci.amount
    END
  ) FILTER (WHERE ci.cost_type = 'fixed'), 0) AS total_fixed_cost,

  -- 每單位利潤 = 售價 - 總成本
  pt.amount - COALESCE(SUM(
    CASE
      WHEN ci.amount_type = 'percentage' THEN ci.amount / 100.0 * pt.amount
      ELSE ci.amount
    END
  ), 0) AS profit_per_unit,

  -- 利潤率（%）
  CASE
    WHEN pt.amount = 0 THEN 0
    ELSE ROUND(
      (pt.amount - COALESCE(SUM(
        CASE
          WHEN ci.amount_type = 'percentage' THEN ci.amount / 100.0 * pt.amount
          ELSE ci.amount
        END
      ), 0)) / pt.amount * 100,
      2
    )
  END AS profit_margin_pct,

  -- 損益平衡點 = 固定成本 / (售價 - 可變成本)
  CASE
    WHEN (pt.amount - COALESCE(SUM(
      CASE
        WHEN ci.amount_type = 'percentage' THEN ci.amount / 100.0 * pt.amount
        ELSE ci.amount
      END
    ) FILTER (WHERE COALESCE(ci.cost_type, 'variable') = 'variable'), 0)) <= 0 THEN NULL
    ELSE CEIL(
      COALESCE(SUM(
        CASE
          WHEN ci.amount_type = 'percentage' THEN ci.amount / 100.0 * pt.amount
          ELSE ci.amount
        END
      ) FILTER (WHERE ci.cost_type = 'fixed'), 0) /
      (pt.amount - COALESCE(SUM(
        CASE
          WHEN ci.amount_type = 'percentage' THEN ci.amount / 100.0 * pt.amount
          ELSE ci.amount
        END
      ) FILTER (WHERE COALESCE(ci.cost_type, 'variable') = 'variable'), 0))
    )
  END AS break_even_units

FROM products p
JOIN price_tiers pt ON pt.product_id = p.id AND pt.is_active = TRUE
LEFT JOIN cost_items ci ON ci.product_id = p.id
GROUP BY p.id, p.name, pt.id, pt.name, pt.price_type, pt.amount;
