require('dotenv').config();

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`缺少必要的環境變數：${key}`);
  }
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
};
