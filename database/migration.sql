-- =====================================================
-- Migration: 成本分組 + 可變/固定類型 + 封面圖片
-- 請在 Supabase SQL Editor 執行此檔案
-- =====================================================

-- Step 1: 新增 cost_type 欄位（可變成本 / 固定成本）
ALTER TABLE cost_items
  ADD COLUMN IF NOT EXISTS cost_type VARCHAR(10) NOT NULL DEFAULT 'variable'
  CHECK (cost_type IN ('variable', 'fixed'));

-- Step 2: 將原本 category = 'fixed' 的項目自動標記為固定成本
UPDATE cost_items SET cost_type = 'fixed' WHERE category = 'fixed';

-- Step 3: 新增成本子分類（營運 + 行銷）
ALTER TYPE cost_category ADD VALUE IF NOT EXISTS 'rent';
ALTER TYPE cost_category ADD VALUE IF NOT EXISTS 'utilities';
ALTER TYPE cost_category ADD VALUE IF NOT EXISTS 'equipment';
ALTER TYPE cost_category ADD VALUE IF NOT EXISTS 'advertising';
ALTER TYPE cost_category ADD VALUE IF NOT EXISTS 'platform_fee';
ALTER TYPE cost_category ADD VALUE IF NOT EXISTS 'shipping_cost';

-- Step 4: 產品封面圖片欄位
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cover_image TEXT;

-- Step 5: 重建 View（改用 cost_type 欄位計算損益平衡點）
DROP VIEW IF EXISTS product_price_analysis;

CREATE VIEW product_price_analysis AS
SELECT
  p.id   AS product_id,
  p.name AS product_name,
  pt.id   AS price_tier_id,
  pt.name AS price_name,
  pt.price_type,
  pt.amount AS selling_price,
  COALESCE(SUM(ci.amount), 0) AS total_cost,
  COALESCE(SUM(ci.amount) FILTER (WHERE ci.cost_type = 'variable'), 0) AS variable_cost,
  COALESCE(SUM(ci.amount) FILTER (WHERE ci.cost_type = 'fixed'),    0) AS total_fixed_cost,
  (pt.amount - COALESCE(SUM(ci.amount), 0)) AS profit_per_unit,
  CASE
    WHEN pt.amount = 0 THEN 0
    ELSE ROUND(
      (pt.amount - COALESCE(SUM(ci.amount), 0)) / pt.amount * 100, 2
    )
  END AS profit_margin_pct,
  CASE
    WHEN (pt.amount - COALESCE(SUM(ci.amount) FILTER (WHERE ci.cost_type = 'variable'), 0)) <= 0
      THEN NULL
    ELSE CEIL(
      COALESCE(SUM(ci.amount) FILTER (WHERE ci.cost_type = 'fixed'), 0) /
      (pt.amount - COALESCE(SUM(ci.amount) FILTER (WHERE ci.cost_type = 'variable'), 0))
    )
  END AS break_even_units
FROM products p
JOIN  price_tiers pt ON pt.product_id = p.id AND pt.is_active = TRUE
LEFT JOIN cost_items ci ON ci.product_id = p.id
GROUP BY p.id, p.name, pt.id, pt.name, pt.price_type, pt.amount;
