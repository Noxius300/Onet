require('dotenv').config();
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

async function columnExists(table, column) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Tabla users OK');

  // Migración: si existe la columna vieja password_hash, renombrarla a password
  if (await columnExists('users', 'password_hash')) {
    await pool.query('ALTER TABLE users RENAME COLUMN password_hash TO password');
    console.log('Columna password_hash -> password renombrada');
  }

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

  // Historial de cambios: almacena la contraseña antigua y la nueva en texto plano
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_history (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      old_password TEXT,
      new_password TEXT NOT NULL,
      changed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pw_history_email ON password_history(email);`);
  console.log('Tabla password_history OK');

  const email = 'test@nexamail.com';
  const plain = 'Test1234';
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO users (email, password) VALUES ($1, $2)', [email, plain]);
    console.log(`Usuario prueba creado: ${email} / ${plain}`);
  } else {
    // Fuerza texto plano (limpia cualquier hash bcrypt heredado)
    await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2', [plain, email]);
    console.log(`Usuario prueba actualizado a texto plano: ${email} / ${plain}`);
  }

  const sample = await pool.query('SELECT email, password FROM users ORDER BY id LIMIT 5');
  console.log('Contenido actual de users:');
  sample.rows.forEach(r => console.log(`  ${r.email} -> ${r.password}`));

  const count = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  console.log(`Total usuarios: ${count.rows[0].n}`);

  const hist = await pool.query('SELECT COUNT(*)::int AS n FROM password_history');
  console.log(`Registros en password_history: ${hist.rows[0].n}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error('init-db error:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
