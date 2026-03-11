@echo off
REM FreeCAD 1.0 uses Python 3.11, while your system Python might be 3.12.
REM This causes a DLL conflict (Module use of python311.dll conflicts with this version of Python).
REM This script forces the bridge to use FreeCAD's built-in Python executable.

set FREECAD_PYTHON="C:\Program Files\FreeCAD 1.0\bin\python.exe"
set BRIDGE_SCRIPT="%~dp0\freecad_bridge.py"

if not exist %FREECAD_PYTHON% (
    echo Error: FreeCAD Python executable not found at %FREECAD_PYTHON%
    exit /b 1
)

%FREECAD_PYTHON% %BRIDGE_SCRIPT% %*
