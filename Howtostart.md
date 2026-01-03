# in /backend (with venv activated)
python -m uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000

# in /frontend
npm install
npm run dev