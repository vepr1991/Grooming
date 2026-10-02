#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npm --prefix client ci
npm --prefix client run build
python3 -m pip install -r backend/requirements.lock.txt
