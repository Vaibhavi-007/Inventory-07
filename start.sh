#!/bin/bash
# Startup script for Change Blindness Experiment System
cd "$(dirname "$0")"

PORT=${PORT:-3000}

echo "=========================================================="
echo " Starting Change Blindness Experiment Platform"
echo " Open your browser at: http://localhost:$PORT"
echo " Press Ctrl+C to stop the server."
echo "=========================================================="

node server.js
