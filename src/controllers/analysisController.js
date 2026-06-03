const supabase = require('../config/database');

async function getProductAnalysis(req, res, next) {
  try {
    const { productId } = req.params;

    // 三個查詢並行執行，減少等待時間
    const [
      { data: product, error: pErr },
      { data: rows,    error: vErr },
      { data: costItems, error: cErr },
    ] = await Promise.all([
      supabase.from('products')
        .select('id, name, description')
        .eq('id', productId)
        .single(),
      supabase.from('product_price_analysis')
        .select('*')
        .eq('product_id', productId),
      supabase.from('cost_items')
        .select('amount, amount_type, category, cost_type')
        .eq('product_id', productId),
    ]);

    if (pErr || !product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定產品' } });
    }
    if (vErr)   throw vErr;
    if (cErr)   throw cErr;

    let totalCost    = 0;
    let variableCost = 0;
    let fixedCost    = 0;
    const costByCategory = {};
    const pctCosts = []; // 百分比成本項目（實際金額依售價而定）

    for (const item of costItems) {
      if (item.amount_type === 'percentage') {
        pctCosts.push({ category: item.category, cost_type: item.cost_type, rate: parseFloat(item.amount) });
        continue; // 百分比成本不計入固定金額統計
      }
      const amt = parseFloat(item.amount);
      costByCategory[item.category] = (costByCategory[item.category] || 0) + amt;
      totalCost += amt;
      if (item.cost_type === 'fixed') {
        fixedCost += amt;
      } else {
        variableCost += amt;
      }
    }

    const totalPctRate = pctCosts.reduce((s, c) => s + c.rate, 0);

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
        pct_costs:     pctCosts,       // 百分比成本項目
        total_pct_rate: totalPctRate,  // 總百分比費率（%）
        prices,
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    // 並行查詢：產品 / 利潤分析 View / 全域成本（product_id IS NULL）
    const [
      { data: products,      error: pErr },
      { data: analysisRows,  error: aErr },
      { data: globalCosts,   error: gErr },
    ] = await Promise.all([
      supabase.from('products').select('id, name').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('product_price_analysis').select('*'),
      supabase.from('cost_items')
        .select('id, name, amount, amount_type, category, cost_type, display_category')
        .is('product_id', null),
    ]);

    if (pErr) throw pErr;
    if (aErr) throw aErr;
    if (gErr) throw gErr;

    // ── 全域成本分組（行銷 / 營運）────────────────────────────
    const MARKETING_CATS  = ['advertising', 'platform_fee', 'shipping_cost'];
    const OPERATIONS_CATS = ['rent', 'utilities', 'equipment', 'fixed'];

    const groupGlobals = (cats) => {
      const items = (globalCosts || []).filter(c => cats.includes(c.category));
      let fixed_total      = 0;
      let percentage_total = 0;
      for (const c of items) {
        const amt = parseFloat(c.amount);
        if (c.amount_type === 'percentage') percentage_total += amt;
        else fixed_total += amt;
      }
      return {
        fixed_total,
        percentage_total,
        items: items.map(c => ({
          id:               c.id,
          name:             c.name,
          amount:           parseFloat(c.amount),
          amount_type:      c.amount_type,
          category:         c.category,
          display_category: c.display_category,
          cost_type:        c.cost_type,
        })),
      };
    };

    const marketing  = groupGlobals(MARKETING_CATS);
    const operations = groupGlobals(OPERATIONS_CATS);
    const otherGlobal = (globalCosts || []).filter(c => c.category === 'other');
    const otherTotals = otherGlobal.reduce((acc, c) => {
      const amt = parseFloat(c.amount);
      if (c.amount_type === 'percentage') acc.percentage_total += amt;
      else acc.fixed_total += amt;
      return acc;
    }, { fixed_total: 0, percentage_total: 0 });

    // ── 處理每個產品 ──────────────────────────────────────────
    const summary = products.map(p => {
      const rows = analysisRows.filter(r => r.product_id === p.id);

      const all_prices = rows.map(r => ({
        price_tier_id:     r.price_tier_id,
        price_name:        r.price_name,
        price_type:        r.price_type,
        selling_price:     parseFloat(r.selling_price),
        total_cost:        parseFloat(r.total_cost),
        variable_cost:     parseFloat(r.variable_cost),
        total_fixed_cost:  parseFloat(r.total_fixed_cost),
        profit_per_unit:   parseFloat(r.profit_per_unit),
        profit_margin_pct: parseFloat(r.profit_margin_pct),
        break_even_units:  r.break_even_units ? parseInt(r.break_even_units) : null,
      }));

      // 取最佳利潤率方案
      let bestRow = null;
      for (const r of all_prices) {
        if (!bestRow || r.profit_margin_pct > bestRow.profit_margin_pct) bestRow = r;
      }

      return {
        product_id:           p.id,
        product_name:         p.name,
        price_count:          rows.length,
        best_margin_pct:      bestRow ? bestRow.profit_margin_pct : null,
        best_price_name:      bestRow ? bestRow.price_name : null,
        best_selling_price:   bestRow ? bestRow.selling_price : null,
        best_total_cost:      bestRow ? bestRow.total_cost : null,
        best_profit_per_unit: bestRow ? bestRow.profit_per_unit : null,
        all_prices,
      };
    });

    // 整體統計
    const withMargin  = summary.filter(p => p.best_margin_pct != null);
    const avgMargin   = withMargin.length > 0
      ? withMargin.reduce((s, p) => s + p.best_margin_pct, 0) / withMargin.length
      : null;
    const highCount   = withMargin.filter(p => p.best_margin_pct >= 30).length;
    const midCount    = withMargin.filter(p => p.best_margin_pct >= 10 && p.best_margin_pct < 30).length;
    const lowCount    = withMargin.filter(p => p.best_margin_pct < 10).length;

    res.json({
      success: true,
      data: {
        products: summary,
        global_costs: {
          marketing,
          operations,
          other: {
            fixed_total:      otherTotals.fixed_total,
            percentage_total: otherTotals.percentage_total,
            items: otherGlobal.map(c => ({
              id:          c.id,
              name:        c.name,
              amount:      parseFloat(c.amount),
              amount_type: c.amount_type,
              category:    c.category,
              cost_type:   c.cost_type,
            })),
          },
        },
        stats: {
          total: products.length,
          avgMargin,
          highCount,
          midCount,
          lowCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProductAnalysis, getSummary };
