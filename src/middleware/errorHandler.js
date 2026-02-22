function errorHandler(err, req, res, next) {
  console.error('[Error]', err.message || err);

  const status  = err.status  || 500;
  const code    = err.code    || 'INTERNAL_ERROR';
  const message = err.message || '伺服器內部錯誤';

  res.status(status).json({ success: false, error: { code, message } });
}

module.exports = errorHandler;
