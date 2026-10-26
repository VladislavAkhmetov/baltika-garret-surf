@echo off
chcp 65001 >nul
title Обновление GARRET на сервере
echo ========================================================
echo   Сборка и отправка обновления на FirstVDS
echo ========================================================
echo.
"d:\dev\experiments\tg crm\venv\Scripts\python.exe" "d:\dev\experiments\tg crm\sync_surf.py"
echo.
echo ========================================================
echo   Готово! Ссылка: https://vlados.ufa.fvds.ru/surf/
echo ========================================================
pause
