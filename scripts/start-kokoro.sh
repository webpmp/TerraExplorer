#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KOKORO_DIR="$REPO_ROOT/local-services/kokoro-tts"
VENV_DIR="$KOKORO_DIR/.venv"

# If .venv doesn't exist, check reference directory ~/Projects/kokoro/venv
if [ ! -f "$VENV_DIR/bin/python" ]; then
    REFERENCE_VENV="$HOME/Projects/kokoro/venv"
    if [ -f "$REFERENCE_VENV/bin/python" ]; then
        VENV_DIR="$REFERENCE_VENV"
    fi
fi

if [ ! -f "$VENV_DIR/bin/python" ]; then
    echo "❌ Kokoro virtual environment not found."
    echo "   Please run the one-time setup script first:"
    echo "     ./scripts/setup-kokoro.sh"
    exit 1
fi

PORT="${KOKORO_PORT:-8880}"
export KOKORO_PORT="$PORT"

echo "========================================================"
echo "Starting Kokoro TTS service on port $PORT..."
echo "Environment: $VENV_DIR"
echo "========================================================"

exec "$VENV_DIR/bin/python" "$KOKORO_DIR/server.py"
