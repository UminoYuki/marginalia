@echo off
chcp 65001 >nul
title Marginalia · 书斋 —— 微信读书摘抄馆
cd /d "%~dp0"

echo =======================================================
echo   Marginalia · 书斋 —— 微信读书摘抄馆
echo   数据源: Obsidian 读书笔记（绝对只读，可在设置中修改）
echo   本地服务地址: http://127.0.0.1:8787
echo   提示: 关闭本窗口即可停止服务
echo =======================================================
echo.

start "" "http://127.0.0.1:8787"
node server.js

pause
