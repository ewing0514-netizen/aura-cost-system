const supabase = require('../config/database');

async function getProductAnalysis(req, res, next) {
  try {
    const { productId } = req.params;

    // 取得產品基本資訊
    const { data: product, error: pErr } = await supabase
      .from('products')
      .select('id, name, description')
      .eq('id', productId)
      .single();

    if (pErr || !product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
    }

    // 從 View 取得損益分析資料
    const { data: rows, error: vErr } = await supabase
      .from('product_price_analysis')
      .select('*')
      .eq('product_id', productId);

    if (vErr) throw vErr;

    // 取得成本明細（各類別加總）
    const { data: costItems, error: cErr } = await supabase
      .from('cost_items')
      .select('amount, category')
      .eq('product_id', productId);

    if (cErr) throw cErr;

    const costByCategory = {
      material: 0, labor: 0, packaging: 0, fixed: 0, other: 0
    };
    let totalCost = 0;
    for (const item of costItems) {
      costByCategory[item.category] = (costByCategory[item.category] || 0) + parseFloat(item.amount);
      totalCost += parseFloat(item.amount);
    }

    const variableCost = costByCategory.material + costByCategory.labor + costByCategory.packaging + costByCategory.other;
    const fixedCost = costByCategory.fixed;

    const prices = rows.map(row => ({
      price_tier_id:     row.price_tier_id,
      price_name:        row.price_name,
      price_type:        row.price_type,
      selling_price:     parseFloat(row.selling_price),
      profit_per_unit:   parseFloat(row.profit_per_unit),
      profit_margin_pct: parseFloat(row.profit_margin_pct),
      break_even_units:  row.break_even_units ? parseInt(row.break_even_units) : null,
    }));

    res.json({
      success: true,
      data: {
        product_id:    product.id,
        product_name:  product.name,
        description:   product.description,
        total_cost:    totalCost,
        variable_cost: variableCost,
        fixed_cost:    fixedCost,
        cost_breakdown: costByCategory,
        prices,
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (pErr) throw pErr;

    const { data: analysisRows, error: aErr } = await supabase
      .from('product_price_analysis')
      .select('product_id, selling_price, profit_margin_pct, price_name');

    if (aErr) throw aErr;

    const summary = products.map(p => {
      const rows = analysisRows.filter(r => r.product_id === p.id);
      let bestMargin = null;
      let bestPriceName = null;
      for (const row of rows) {
        const margin = parseFloat(row.profit_margin_pct);
        if (bestMargin === null || margin > bestMargin) {
          bestMargin = margin;
          bestPriceName = row.price_name;
        }
      }
      return {
        product_id:       p.id,
        product_name:     p.name,
        price_count:      rows.length,
        best_margin_pct:  bestMargin,
        best_price_name:  bestPriceName,
      };
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProductAnalysis, getSummary };
