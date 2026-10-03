# Onet

Sitio estático (página `index.html`).

## Desarrollo local (frontend + backend + Neon)
Frontend (puerto 8000 para no chocar con la API):
```powershell
npx serve . -l 8000
# abrir http://localhost:8000
```

Backend (API conectada a Neon Postgres):
```powershell
cd api
npm install
npm run init-db   # crea tabla users + usuario prueba test@nexamail.com / Test1234
npm start         # API en http://localhost:3000
```

Probar:
```powershell
Invoke-RestMethod http://localhost:3000/health
```

## Deploy en Render (2 servicios)
Static Site (frontend, el que ya tienes):
- Branch: `main`
- Build Command: *(vacío)*
- Publish Directory: `./`

Web Service nuevo (backend `/api`):
- Root Directory: `api`
- Build Command: `npm install`
- Start Command: `node server.js`
- Env vars: `DATABASE_URL` (tu string de Neon), `FRONTEND_URL=https://tu-sitio.onrender.com`
- Luego en `index.html` cambia `API_URL` de `https://tu-api.onrender.com` a la URL real de tu Web Service.
