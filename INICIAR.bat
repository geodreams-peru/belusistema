@echo off
title BELU SYSTEM
cd /d "%~dp0"

echo.
echo  ========================================
echo    BELU SYSTEM - Sistema de Gestion
echo  ========================================
echo.

IF NOT EXIST node_modules (
  echo  Instalando dependencias por primera vez...
  npm install
  echo.
)

echo  Iniciando servidor en http://localhost:3000
echo  Presiona Ctrl+C para detener.
echo.

node server.js
pause
