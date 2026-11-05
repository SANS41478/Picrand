@echo off
set VSCMD_START_DIR=
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cd /d "%~dp0"
cl /EHsc /std:c++17 /utf-8 /DUNICODE /D_UNICODE src\main.cpp /Febuild\Release\RefBoardHost.exe /link /SUBSYSTEM:WINDOWS user32.lib gdi32.lib shell32.lib ole32.lib oleaut32.lib uuid.lib d2d1.lib dxgi.lib dwrite.lib windowscodecs.lib
