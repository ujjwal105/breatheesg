# Breathe ESG Prototype

Prototype Django + React app for ingesting SAP, utility, and travel data into a review queue.

## Local run

Backend:

```bash
cd backend
python3 manage.py migrate
python3 manage.py runserver 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

If you want demo data instead of uploading samples:

```bash
cd backend
python3 manage.py seed_demo
```

## Deployment note

The frontend reads `VITE_API_BASE_URL` if you want to point it at a deployed API.
For local development it uses the Vite proxy at `http://127.0.0.1:8000`.

## Render deployment

This repo is configured for two Render services:

1. `breathe-esg-api` as a Python web service from `backend/`
2. `breathe-esg-web` as a static site from `frontend/`

Render uses [render.yaml](/Users/ujjwaltyagi/Desktop/breatheesg/render.yaml) to wire both services and the required environment variables.

Before the first deploy:

1. Push the repo to GitHub.
2. Create a new Render Blueprint from that repo.
3. Confirm the backend service uses `python3 -m pip install -r requirements.txt && python3 manage.py migrate` for build.
4. Confirm the backend start command is `gunicorn config.wsgi:application`.
5. Confirm `ALLOWED_HOSTS` includes the backend hostname.
6. Confirm `CORS_ALLOWED_ORIGINS` includes the frontend hostname.
7. Confirm the static site uses `npm install && npm run build`.
8. Set `VITE_API_BASE_URL` to the backend service URL.

After deploy:

1. Open the backend service and run `python3 manage.py seed_demo` once if you want demo rows.
2. Open the frontend service and verify imports, review, and approve work end to end.
