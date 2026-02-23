const router = require('express').Router();
const costItems = require('../controllers/costItemController');

router.use('/products', require('./products'));
router.use('/analysis', require('./analysis'));

// 全域成本（Dashboard 管理的公司層級成本）
router.get('/costs',              costItems.listGlobal);
router.post('/costs',             costItems.createGlobal);
router.put('/costs/:costId',      costItems.updateGlobal);
router.delete('/costs/:costId',   costItems.removeGlobal);

router.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));

module.exports = router;
