const router = require('express').Router();
const products = require('../controllers/productController');
const costItems = require('../controllers/costItemController');
const priceTiers = require('../controllers/priceTierController');
const analysis = require('../controllers/analysisController');

// 產品 CRUD
router.get('/',     products.list);
router.get('/:id',  products.get);
router.post('/',    products.create);
router.put('/:id',  products.update);
router.delete('/:id', products.remove);

// 成本項目（巢狀路由）
router.get('/:productId/costs',              costItems.list);
router.post('/:productId/costs',             costItems.create);
router.put('/:productId/costs/:costId',      costItems.update);
router.delete('/:productId/costs/:costId',   costItems.remove);

// 售價設定（巢狀路由）
router.get('/:productId/prices',             priceTiers.list);
router.post('/:productId/prices',            priceTiers.create);
router.put('/:productId/prices/:priceId',    priceTiers.update);
router.delete('/:productId/prices/:priceId', priceTiers.remove);

// 損益分析
router.get('/:productId/analysis', analysis.getProductAnalysis);

module.exports = router;
