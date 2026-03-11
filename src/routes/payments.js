const router = require('express').Router();
const suppliers = require('../controllers/supplierController');
const orders    = require('../controllers/purchaseOrderController');

// 供應商
router.get('/suppliers',                                         suppliers.list);
router.post('/suppliers',                                        suppliers.create);
router.put('/suppliers/:id',                                     suppliers.update);
router.delete('/suppliers/:id',                                  suppliers.remove);
// AI 提取供應商資訊（multer middleware 掛在 controller 上）
router.post('/suppliers/extract-info', suppliers.extractInfo.upload, suppliers.extractInfo);

// 採購訂單
router.get('/purchase-orders',        orders.list);
router.get('/purchase-orders/:id',    orders.get);
router.post('/purchase-orders',       orders.create);
router.put('/purchase-orders/:id',    orders.update);
router.delete('/purchase-orders/:id', orders.remove);

module.exports = router;
