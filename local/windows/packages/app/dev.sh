#!/bin/bash

# Start vite in background
pnpm vite &
VITE_PID=$!

# Wait for initial build
sleep 5

# Patch the main.js file
echo "Patching dist-electron/main.js..."
sed -i '' '2a\
const { app, BrowserWindow, ipcMain } = electron;
' dist-electron/main.js

sed -i '' 's/electron\.app\./app./g; s/electron\.BrowserWindow/BrowserWindow/g; s/electron\.ipcMain/ipcMain/g' dist-electron/main.js

echo "Patch applied. Electron should start now..."

# Wait for vite process
wait $VITE_PID
