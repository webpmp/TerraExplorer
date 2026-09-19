#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KOKORO_DIR="$REPO_ROOT/local-services/kokoro-tts"
VENV_DIR="$KOKORO_DIR/.venv"

echo "========================================================"
echo "          TerraExplorer Kokoro TTS Setup"
echo "========================================================"

# 1. Check for Python 3.11+
PYTHON_BIN=""
if command -v python3.11 >/dev/null 2>&1; then
    PYTHON_BIN="python3.11"
elif command -v python3 >/dev/null 2>&1; then
    PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 11 ]; then
        PYTHON_BIN="python3"
    fi
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "❌ Python 3.11+ is required for Kokoro TTS."
    echo "   Please install Python 3.11 via Homebrew (brew install python@3.11) or your package manager."
    exit 1
fi

echo "✓ Found Python: $($PYTHON_BIN --version) at $(which $PYTHON_BIN)"

# 2. Setup Virtual Environment
if [ ! -d "$VENV_DIR" ]; then
    # Check if existing standalone reference environment exists at ~/Projects/kokoro/venv
    REFERENCE_VENV="$HOME/Projects/kokoro/venv"
    if [ -d "$REFERENCE_VENV" ] && [ -f "$REFERENCE_VENV/bin/python" ]; then
        echo "✓ Found existing reference Kokoro environment at $REFERENCE_VENV"
        echo "  Linking local service environment to existing working reference..."
        ln -s "$REFERENCE_VENV" "$VENV_DIR"
    else
        echo "Creating dedicated virtual environment at: $VENV_DIR"
        $PYTHON_BIN -m venv "$VENV_DIR"
    fi
else
    echo "✓ Virtual environment already exists at $VENV_DIR"
fi

# 3. Install requirements
echo "Installing/verifying dependencies from $KOKORO_DIR/requirements.txt..."
"$VENV_DIR/bin/pip" install --upgrade pip setuptools wheel --quiet
"$VENV_DIR/bin/pip" install -r "$KOKORO_DIR/requirements.txt"

echo "========================================================"
echo "✓ Kokoro environment successfully configured!"
echo "  Location: $VENV_DIR"
echo ""
echo "Next step: Start the Kokoro service with:"
echo "  ./scripts/start-kokoro.sh"
echo "========================================================"
