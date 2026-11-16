#!/bin/bash
# Double-click to start OnCurve on macOS (or run it from a terminal on Linux).
# Checks that Node.js is installed, runs the one-time setup if needed, then starts the
# app and opens it in the browser. Works from a folder whose path contains spaces.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed, or it is not on the PATH."
  echo "Install the LTS version from https://nodejs.org, then open this file again."
  read -r -p "Press Enter to close."
  exit 1
fi

major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 22 ]; then
  echo "OnCurve needs Node.js 22 or newer. This computer has $(node -v)."
  echo "Install the LTS version from https://nodejs.org, then try again."
  read -r -p "Press Enter to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First start: running the one-time setup. This takes a minute or two."
  if ! npm run setup; then
    echo "Setup did not finish. The error is shown above."
    read -r -p "Press Enter to close."
    exit 1
  fi
fi

npm start
