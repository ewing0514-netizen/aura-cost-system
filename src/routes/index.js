const router = require('express').Router();

router.use('/products', require('./products'));
router.use('/analysis', require('./analysis'));

router.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));

module.exports = router;
