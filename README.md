# IoT LMs Link (Arduino Nano 33 BLE Sense + MCP)

## Repo Summary
Bridge firmware on an Arduino Nano 33 BLE Sense Rev2 to language models via an MCP server. The microcontroller streams sensor data as JSON over serial; the Python server parses it and exposes LED controls plus live sensor readings to MCP-aware clients like Claude.

## Overview
- Two-part setup: firmware on an Arduino Nano 33 BLE Sense Rev2 and a Python MCP server that exposes board functions to MCP clients.
- Firmware (PlatformIO) should stream sensor readings over serial as JSON; the MCP server listens on a COM port, parses packets, and offers tools for LEDs and live sensor values.

## Repository Layout
- `IoT_Device/` - PlatformIO project for the Nano 33 BLE Sense Rev2 (`platformio.ini`, `src/main.cpp`).
- `MCP_Server/main.py` - Python MCP server using `fastmcp` and `pyserial` to bridge the board to MCP tools.
- `IoT_Device/include|lib|test/` - PlatformIO scaffolding.

## Hardware & Dependencies
- Hardware: Arduino Nano 33 BLE Sense Rev2 (HS3003, LPS22HB, APDS9960, BMI270/BMM150 sensors), Micro-USB cable.
- Host: Windows (default port set to `COM5` in `MCP_Server/main.py`; change to your actual port).
- Python: `fastmcp`, `pyserial` (create a venv: `python -m venv .venv && .\\.venv\\Scripts\\activate && pip install fastmcp pyserial`).
- PlatformIO CLI or VS Code PlatformIO extension for building/flashing firmware.

## Firmware (PlatformIO)
1) Install PlatformIO CLI or the VS Code extension.
2) Connect the Nano 33 BLE Sense Rev2, identify the COM port.
3) From `IoT_Device/`:
   - Build: `pio run`
   - Flash: `pio run --target upload --upload-port <COM_PORT>`
   - Monitor serial: `pio device monitor --port <COM_PORT>`
4) Implement sensor reads and JSON output in `src/main.cpp` (current file is a stub). Match the MCP server's expected keys (see "Serial Packet Format").

## MCP Server
1) From repo root, activate your venv and install deps (see above).
2) Set the correct serial port in `MCP_Server/main.py` (`PORT = "COM5"`).
3) Run: `python MCP_Server/main.py`
   - Starts FastMCP server; LEDs flash once at startup to confirm connection.
   - For HTTP transport, uncomment `ArduinoMCP.run(transport="http", host="127.0.0.1", port=8000)`.

### Exposed MCP Tools (in `main.py`)
- `red_led_ON` - Turn red LED on for 2s, then off.
- `led_OFF` - Turn all LEDs off.
- `get_current_temperature` - Latest HS3003 degC reading.
- `get_current_gyro` - Latest gyro (dps) vector.
- `get_current_accelerometer` - Latest accelerometer (g) vector.
- `test` - Returns latest accelerometer vector (for debugging).
- TODO: blue LED helper.

## Use with Claude (MCP client)
You can load this server directly in Claude (desktop or web) by adding the MCP server entry below to your Claude config file (e.g., `C:\\Users\\Lenovo\\AppData\\Roaming\\Claude\\claude_desktop_config.json`). Restart Claude after saving.

```json
{
  "mcpServers": {
    "DevAIoT": {
      "command": "python",
      "args": [
        "D:/mattc/Documents/Projects/Finland/Week4-Group2/IoT-LMs/MCP_Server/main.py"
      ]
    }
  }
}
```

## Serial Packet Format (expected by server)
Each line on serial should be a single JSON object with any of these fields:
```json
{
  "hs3003_t_c": 23.5,
  "hs3003_h_rh": 45.1,
  "lps22hb_p_kpa": 101.325,
  "lps22hb_t_c": 23.7,
  "apds_prox": 123,
  "apds_color": {"r": 10, "g": 12, "b": 14, "c": 30},
  "apds_gesture": 0,
  "acc_g": {"x": 0.01, "y": -0.02, "z": 0.98},
  "gyro_dps": {"x": 0.3, "y": -0.1, "z": 0.0},
  "mag_uT": {"x": 5.2, "y": -1.0, "z": 42.0}
}
```
Missing values are fine; the server treats fields as optional.

## Roadmap / TODO
- Implement real sensor acquisition and JSON streaming in `src/main.cpp`.
- Add blue LED helper in `MCP_Server/main.py`.
- Add unit tests for packet parsing and tool responses.
- Optionally package MCP server with HTTP transport enabled by default.

## License
- Add your project license here (currently not specified).
