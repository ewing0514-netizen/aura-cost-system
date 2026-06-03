const router = require('express').Router();
const suppliers = require('../controllers/supplierController');
const orders    = require('../controllers/purchaseOrderController');
const incomes   = require('../controllers/incomeRecordController');

// 供應商
router.get('/suppliers',                                         suppliers.list);
router.post('/suppliers',                                        suppliers.create);
// AI 提取供應商資訊（multer middleware 掛在 controller 上，須在 /:id 之前）
router.post('/suppliers/extract-info', suppliers.extractInfo.upload, suppliers.extractInfo);
router.put('/suppliers/:id',                                     suppliers.update);
router.delete('/suppliers/:id',                                  suppliers.remove);

// 採購訂單（支出）
router.get('/purchase-orders',        orders.list);
router.get('/purchase-orders/:id',    orders.get);
router.post('/purchase-orders',       orders.create);
router.put('/purchase-orders/:id',    orders.update);
router.delete('/purchase-orders/:id', orders.remove);

// 現金收入記錄
router.get('/income-records',        incomes.list);
router.get('/income-records/:id',    incomes.get);
router.post('/income-records',       incomes.create);
router.put('/income-records/:id',    incomes.update);
router.delete('/income-records/:id', incomes.remove);

module.exports = router;
