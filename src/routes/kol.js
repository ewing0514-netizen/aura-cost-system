const router = require('express').Router();
const ctrl = require('../controllers/kolController');

// 分潤紀錄（須在 /:id 之前，避免被當作 id 解析）
router.get('/commissions',         ctrl.listCommissions);
router.get('/commissions/:id',     ctrl.getCommission);
router.post('/commissions',        ctrl.createCommission);
router.put('/commissions/:id',     ctrl.updateCommission);
router.delete('/commissions/:id',  ctrl.removeCommission);

// 團主資料
router.get('/',                    ctrl.listKols);
router.post('/',                   ctrl.createKol);
router.put('/:id',                 ctrl.updateKol);
router.delete('/:id',              ctrl.removeKol);

module.exports = router;
