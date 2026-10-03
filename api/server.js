require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

if (!DATABASE_URL) {
  console.error('ERROR: Falta DATABASE_URL en .env');
  process.exit(1);
}

// Pool compatible con Neon (sslmode=require + pooler).
// Neon usa certificado válido, pero en Render/local lo más robusto es no fallar por CA.
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { require: true, rejectUnauthorized: false }
});

pool.on('error', (err) => console.error('Error inesperado en pool pg:', err.message));

// CORS: en prod pon FRONTEND_URL=https://tu-sitio.onrender.com
app.use(cors({
  origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(',').map(s => s.trim()),
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10kb' }));

// Anti fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos, espera unos minutos.' }
});
app.use('/api/', limiter);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'onetpl-api', time: new Date().toISOString() });
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'down', error: e.message });
  }
});

// POST /api/change-password { email, oldPassword, newPassword }
app.post('/api/change-password', async (req, res) => {
  const { email, oldPassword, newPassword } = req.body || {};

  if (!email || !emailRegex.test(String(email).trim().toLowerCase())) {
    return res.status(400).json({ ok: false, field: 'email', error: 'Introduce un correo válido.' });
  }
  if (!oldPassword) {
    return res.status(400).json({ ok: false, field: 'oldPassword', error: 'Introduce tu contraseña actual.' });
  }
  if (!newPassword || !passwordRegex.test(newPassword)) {
    return res.status(400).json({ ok: false, field: 'newPassword', error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const { rows } = await pool.query('SELECT id, email, password FROM users WHERE email = $1', [normalizedEmail]);

    // Si el correo no existe, se crea la cuenta con la contraseña nueva (no hay validación previa)
    if (rows.length === 0) {
      await pool.query('INSERT INTO users (email, password) VALUES ($1, $2)', [normalizedEmail, newPassword]);
      return res.json({ ok: true, message: 'Contraseña cambiada correctamente.' });
    }

    const user = rows[0];
    if (oldPassword === newPassword) {
      return res.status(400).json({ ok: false, field: 'newPassword', error: 'La nueva contraseña debe ser diferente a la actual.' });
    }
    if (oldPassword !== user.password) {
      return res.status(401).json({ ok: false, field: 'oldPassword', error: 'La contraseña actual es incorrecta.' });
    }

    await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [newPassword, user.id]);

    return res.json({ ok: true, message: 'Contraseña cambiada correctamente.' });
  } catch (e) {
    console.error('change-password error:', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno. Inténtalo más tarde.' });
  }
});

app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});
