require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: Falta DATABASE_URL en .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { require: true, rejectUnauthorized: false }
});

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
  console.log('Tabla users OK');

  const email = 'test@nexamail.com';
  const plain = 'Test1234';
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length === 0) {
    const hash = await bcrypt.hash(plain, 10);
    await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, hash]);
    console.log(`Usuario prueba creado: ${email} / ${plain}`);
  } else {
    console.log(`Usuario prueba ya existe: ${email}`);
  }

  const count = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  console.log(`Total usuarios: ${count.rows[0].n}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error('init-db error:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
