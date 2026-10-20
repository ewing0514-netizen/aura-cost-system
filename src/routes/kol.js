const router = require('express').Router();
const ctrl = require('../controllers/kolController');
const samples = require('../controllers/kolSampleController');

// 分潤紀錄（須在 /:id 之前，避免被當作 id 解析）
router.get('/commissions',         ctrl.listCommissions);
router.get('/commissions/:id',     ctrl.getCommission);
router.post('/commissions',        ctrl.createCommission);
router.put('/commissions/:id',     ctrl.updateCommission);
router.delete('/commissions/:id',  ctrl.removeCommission);

// 樣品寄送（同樣須在 /:id 之前）
router.get('/samples',             samples.list);
router.post('/samples',            samples.create);
router.put('/samples/:id',         samples.update);
router.patch('/samples/:id/status', samples.setStatus);
router.delete('/samples/:id',      samples.remove);

// 團主資料
router.get('/',                    ctrl.listKols);
router.post('/',                   ctrl.createKol);
router.put('/:id',                 ctrl.updateKol);
router.delete('/:id',              ctrl.removeKol);

module.exports = router;
