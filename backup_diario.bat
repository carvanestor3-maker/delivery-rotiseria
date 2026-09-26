@echo off
cd /d "%~dp0"
node backup.js >> "%~dp0backup_log.txt" 2>&1
