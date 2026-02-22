const router = require('express').Router();
const analysis = require('../controllers/analysisController');

router.get('/summary', analysis.getSummary);

module.exports = router;
