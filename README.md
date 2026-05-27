# HealHive

HealHive is a full-stack health assistant web app with a React frontend and an Express/MongoDB backend. The frontend provides the chat UI, auth flows, and specialty consultation screens. The backend handles chat responses, authentication, scraping, and persistence.

## Project Structure

- `frontend/` - React app built with `react-scripts`
- `backend/` - Express API, scrapers, models, and services

## Prerequisites

- Node.js 18+ recommended
- MongoDB connection string
- API keys for the backend services you use

## Backend Setup

1. Open a terminal in `backend/`
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file with the values your deployment needs. Common variables used by the backend include:

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `GEMINI_API_KEY`
- `NCBI_API_KEY`
- `FRONTEND_URL`
- `PORT`

4. Start the backend:

```bash
npm run dev
```

Use `npm start` for a normal production-style run.

## Frontend Setup

1. Open a terminal in `frontend/`
2. Install dependencies:

```bash
npm install
```

3. Start the frontend:

```bash
npm start
```

## Build

To create a production frontend build:

```bash
cd frontend
npm run build
```

## Notes

- The app icon assets live in `frontend/public/`.
- The frontend currently uses inline icons for the in-app brand mark, while the browser favicon is loaded from the public folder.
- If you move the frontend or backend to a different host, update the related environment variables before deployment.
