@echo off
title Servidor de Emergencia - La Gran Rotiseria
cd /d "%~dp0"
echo ============================================
echo   MODO EMERGENCIA - SERVIDOR LOCAL
echo   Usar SOLO si se corta el internet del local
echo ============================================
echo.
echo Tu direccion IP en esta red WiFi es:
ipconfig | findstr /i "IPv4"
echo.
echo Los celulares de Cocina, Caja y Admin deben conectarse
echo (estando en el MISMO WiFi que esta PC) a:
echo.
echo   http://TU_IP:3000/cocina.html
echo   http://TU_IP:3000/caja.html
echo   http://TU_IP:3000/admin.html
echo   http://TU_IP:3000/          (menu de clientes)
echo.
echo Reemplaza TU_IP por una de las direcciones de arriba.
echo.
echo No cierres esta ventana mientras estes usando el modo emergencia.
echo.
pause
npm start
