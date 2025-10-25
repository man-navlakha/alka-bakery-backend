# Alka Bakery Backend (Vercel-ready)
Express.js backend using:
- Supabase (Postgres)
- JWT authentication
- Cloudinary for uploads
- Nodemailer for emails
- Cash-on-delivery only (no payment integration)

## Quick start (local)
1. Copy `.env.example` to `.env` and fill values.
2. `npm install`
3. `npm run dev` (requires nodemon) or `npm start`

## Deploy to Vercel
1. Push to GitHub.
2. Import project on Vercel.
3. Set environment variables in Vercel dashboard (same names as .env.example).
4. Deploy.

## Project structure
- api/index.js           - Vercel entry (runs Express app)
- src/                   - application source (config, routes, utils, middleware)
- vercel.json            - Vercel build & routes
