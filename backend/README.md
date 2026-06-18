# EchoVision Backend

Async FastAPI backend for the EchoVision accessibility platform.

## Prerequisites

- **Python 3.11+**
- **[uv](https://docs.astral.sh/uv/)** — fast Python package manager

## Quick Start

### 1. Install uv (if not already installed)

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Edit .env and fill in your API keys:
#   GEMINI_API_KEY=your_gemini_key_here
#   SARVAM_API_KEY=your_sarvam_key_here
```

### 3. Run the backend

```bash
uv run uvicorn app.main:app --reload
```

That's it! `uv` will automatically:
- Create a virtual environment
- Install all dependencies from `pyproject.toml`
- Start the FastAPI server on `http://localhost:8000`

### 4. Verify it's running

- **Health check**: http://localhost:8000/
- **API docs (Swagger)**: http://localhost:8000/docs
- **API docs (ReDoc)**: http://localhost:8000/redoc

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/health` | Detailed health check |
| `POST` | `/api/v1/voice/intent` | Classify Hinglish voice command |
| `POST` | `/api/v1/voice/stt` | Speech-to-Text (Sarvam AI) |
| `POST` | `/api/v1/voice/tts` | Text-to-Speech (Sarvam AI) |
| `POST` | `/api/v1/vision/scan` | Scene description from image |

## Project Structure

```
backend/
├── pyproject.toml          # Dependencies & project metadata
├── .env.example            # Environment variable template
├── .env                    # Your local secrets (git-ignored)
├── README.md               # This file
└── app/
    ├── __init__.py
    ├── main.py             # FastAPI application entry point
    ├── core/
    │   ├── __init__.py
    │   ├── config.py       # Settings & env loading
    │   └── security.py     # Auth dependency (Firebase-ready stub)
    ├── api/
    │   └── v1/
    │       ├── __init__.py
    │       ├── voice.py    # Voice endpoint routes
    │       └── vision.py   # Vision endpoint routes
    ├── schemas/
    │   ├── __init__.py
    │   ├── voice.py        # Voice request/response models
    │   └── vision.py       # Vision request/response models
    └── services/
        ├── __init__.py
        ├── gemini_service.py   # Google Gemini integration
        └── sarvam_service.py   # Sarvam AI STT/TTS integration
```

## Authentication

The backend includes a `get_current_user` dependency stub that currently
bypasses all token validation. When you're ready to add Firebase Auth:

1. Install `firebase-admin`
2. Update `app/core/security.py` to verify JWT tokens
3. No route changes needed — all endpoints already use `Depends(get_current_user)`

## Development

```bash
# Run with auto-reload
uv run uvicorn app.main:app --reload

# Run linter
uv run ruff check app/

# Run tests
uv run pytest
```
