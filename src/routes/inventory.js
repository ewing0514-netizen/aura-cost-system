const router = require('express').Router();
const ctrl = require('../controllers/inventoryController');

router.get('/summary',       ctrl.summary);
router.get('/movements',     ctrl.listMovements);
router.post('/movements',    ctrl.createMovement);
router.put('/movements/:id', ctrl.updateMovement);
router.delete('/movements/:id', ctrl.removeMovement);

module.exports = router;
