# ForensiAI – AI-Powered Cyber Incident Investigation System (Frontend)

Production-style React (Vite) frontend with Tailwind, Axios, React Router, and Recharts.

## Requirements

- Node.js 18+ (works with newer versions)

## Setup

```bash
npm install
npm run dev
```

## API

The app calls:

- `GET /api/dashboard`
- `GET /api/incidents`
- `GET /api/timeline`
- `POST /api/chat`
- `GET /api/report`

If the backend is not available, the app automatically falls back to mock data via `setTimeout` in `src/services/api.js`.

## Env

Optional:

- `VITE_API_BASE_URL` (e.g. `http://localhost:8080`)

