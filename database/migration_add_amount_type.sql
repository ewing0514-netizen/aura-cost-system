-- ================================================================
-- Migration: 新增 amount_type 欄位（支援百分比成本）
-- 在 Supabase SQL Editor 執行此檔案
-- ================================================================

-- Step 1: 新增 amount_type 欄位
ALTER TABLE cost_items
  ADD COLUMN IF NOT EXISTS amount_type VARCHAR(10) NOT NULL DEFAULT 'fixed'
  CHECK (amount_type IN ('fixed', 'percentage'));

-- Step 2: 重建 product_price_analysis View（支援百分比計費）
DROP VIEW IF EXISTS product_price_analysis;

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
