from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import queue
import serial
import threading
import time
from typing import Optional, Callable, Any, Dict, List
from collections import deque

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pydantic import BaseModel
from fastmcp import FastMCP

# --- Basic Setup ---
logger = logging.getLogger("devaiot-mcp")
logger.setLevel(logging.DEBUG)
PORT = 'COM7'  # Change to your COM port if different
LOG_DEQUE = deque(maxlen=300)

# --- Logging Configuration ---
def configure_logging() -> None:
    formatter = logging.Formatter("%(asctime)sZ %(levelname)s %(message)s")
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

configure_logging()

# --- Data Structures ---
@dataclass(frozen=True)
class Vec3:
    x: float
    y: float
    z: float

@dataclass(frozen=True)
class ApdsColor:
    r: int
    g: int
    b: int
    c: int

@dataclass(frozen=True)
class SensorPacket:
    timestamp: datetime
    raw_line: str
    raw_json: Optional[Dict[str, Any]] = None
    kind: str = "text"
    temp_c: Optional[float] = None
    humidity_rh: Optional[float] = None
    position: Optional[Dict[str, Any]] = None
    distance_to_target: Optional[float] = None
    ack: Optional[str] = None
    error: Optional[str] = None
    info: Optional[str] = None
    acc_g: Optional[Vec3] = None
    gyro_dps: Optional[Vec3] = None

# --- Arduino Communication ---

def _as_vec3(val: Any) -> Optional[Vec3]:
    try:
        if isinstance(val, Vec3): return val
        if isinstance(val, (list, tuple)) and len(val) == 3:
            return Vec3(float(val[0]), float(val[1]), float(val[2]))
    except Exception:
        return None
    return None

def _parse_nonjson_line(ts: datetime, line: str) -> Optional[SensorPacket]:
    if line.startswith("ACK="):
        payload = line[4:]
        coords: Optional[Dict[str, float]] = None
        parts = payload.split(",")
        if parts[0] == "TARGET_SET" and len(parts) == 4:
            try:
                coords = {"x": float(parts[1]), "y": float(parts[2]), "z": float(parts[3])}
            except Exception:
                coords = None
        return SensorPacket(timestamp=ts, raw_line=line, kind="ack", ack=payload, position=coords, info=payload)
    if line.startswith("ERR="):
        return SensorPacket(timestamp=ts, raw_line=line, kind="err", error=line[4:], info=line[4:])
    if line.lower().startswith("distance to target"):
        return None
    return SensorPacket(timestamp=ts, raw_line=line, kind="text", info=line)

def parse_packet(line: str) -> Optional[SensorPacket]:
    if not line: return None
    ts = datetime.now(timezone.utc)
    try:
        obj = json.loads(line)
        if not isinstance(obj, dict):
            return SensorPacket(timestamp=ts, raw_line=line, raw_json=obj, kind="json")
        
        position = obj.get("position") if isinstance(obj.get("position"), dict) else None
        
        return SensorPacket(
            timestamp=ts, raw_line=line, raw_json=obj, kind="json",
            temp_c=obj.get("temp_c"),
            humidity_rh=obj.get("humidity_rh"),
            position=position,
            distance_to_target=obj.get("distance_to_target"),
            acc_g=_as_vec3(obj.get("acc_g")),
            gyro_dps=_as_vec3(obj.get("gyro_dps")),
        )
    except Exception:
        return _parse_nonjson_line(ts, line)

def clear_queue(q: queue.Queue):
    while not q.empty():
        try:
            q.get_nowait()
            q.task_done()
        except queue.Empty:
            break

class Nano33SenseRev2:
    def __init__(self, port: str, baud: int = 115200, on_packet: Optional[Callable[[SensorPacket], None]] = None):
        self.ser = serial.Serial(port, baud, timeout=1)
        self.on_packet = on_packet
        self._running = True
        self._latest_sensor = queue.Queue(maxsize=1)
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def _send(self, msg: str):
        if not msg.endswith("\n"): msg += "\n"
        self.ser.write(msg.encode("utf-8"))

    def _read_loop(self):
        while self._running:
            try:
                raw = self.ser.readline()
                if not raw: continue
                line = raw.decode(errors="replace").strip()
                if not line: continue
                
                pkt = parse_packet(line)
                if pkt:
                    if self.on_packet: self.on_packet(pkt)
                    if pkt.kind == "json":
                        clear_queue(self._latest_sensor)
                        self._latest_sensor.put(pkt, block=False)
            except serial.SerialException as e:
                logger.error(f"Serial error: {e}")
                time.sleep(5) # Avoid spamming logs on disconnect
            except Exception as e:
                logger.error(f"Error in read loop: {e}")

    def get_state(self) -> Optional[SensorPacket]:
        try:
            return self._latest_sensor.get(timeout=2)
        except queue.Empty:
            return None

    def goto(self, x: float, y: float, z: float):
        self._send(f"GOTO={x},{y},{z}")

    def rgb(self, r: int, g: int, b: int):
        self._send(f"RGB={r},{g},{b}")

    def red_LED(self): self.rgb(255, 0, 0)
    def yellow_LED(self): self.rgb(255, 255, 0)
    def off(self): self.rgb(0, 0, 0)

    def close(self):
        self._running = False
        if self.ser and self.ser.is_open:
            self.ser.close()

# --- Log Processing ---
def show(p: SensorPacket) -> None:
    log_level = "INFO"
    message = ""

    if p.kind == 'json':
        if p.position:
            pos = p.position
            message = f"POSITION x={pos.get('x', 0):.2f}, y={pos.get('y', 0):.2f}, z={pos.get('z', 0):.2f}"
        else:
            return
    elif p.kind == 'err':
        log_level = "ERROR"
        message = p.error or p.raw_line
    elif p.kind == 'ack':
        log_level = "DEBUG"
        message = p.ack or p.raw_line
    elif p.info:
        message = p.info
    else:
        message = p.raw_line

    if not message or not message.strip():
        return

    # Log to console
    if log_level == "ERROR": logger.error(message)
    elif log_level == "DEBUG": logger.debug(message)
    else: logger.info(message)
    
    # Add to UI log deque
    log_line = f"{p.timestamp.isoformat().replace('+00:00', 'Z')} {log_level} {message}"
    LOG_DEQUE.append(log_line)

# --- FastAPI Web Server ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

@app.get("/logs")
def get_logs(limit: int = 300):
    return {"lines": list(LOG_DEQUE)}

class GotoCoords(BaseModel):
    x: float
    y: float
    z: float

def set_goto_target(x: float, y: float, z: float) -> str:
    """Sends GOTO command to the board and logs it."""
    board.goto(x, y, z)
    log_message = f"GOTO target set to: x={x}, y={y}, z={z}."
    logger.info(log_message)
    # log_line = f"{datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')} INFO {log_message}"
    # LOG_DEQUE.append(log_line)
    return f"GOTO target set to: x={x}, y={y}, z={z}."

@app.post("/mcp/goto_target")
def handle_goto_target(coords: GotoCoords):
    message = set_goto_target(coords.x, coords.y, coords.z)
    return {"message": message, "x": coords.x, "y": coords.y, "z": coords.z}

# --- MCP Server and Tools ---
board = Nano33SenseRev2(PORT, on_packet=show)
ArduinoMCP = FastMCP('Arduino Servers')

@ArduinoMCP.tool
def goto_target(x: float, y: float, z: float) -> str:
    """Sets the target coordinates on the Arduino (meters)."""
    return set_goto_target(x, y, z)

@ArduinoMCP.tool
def get_current_temperature():
    """Gets the most recent temperature from the Arduino"""
    state = board.get_state()
    if state and state.temp_c is not None:
        return f"{state.temp_c:.2f} degrees celsius"
    return "Could not retrieve temperature."

@ArduinoMCP.tool
def get_current_humidity():
    """Gets the most recent humidity from the Arduino"""
    state = board.get_state()
    if state and state.humidity_rh is not None:
        return f"{state.humidity_rh:.2f}%"
    return "Could not retrieve humidity."

@ArduinoMCP.tool
def get_current_position():
    """Gets the most recent position from the Arduino"""
    state = board.get_state()
    if state and state.position:
        pos = state.position
        return f"x={pos['x']:.2f}, y={pos['y']:.2f}, z={pos['z']:.2f}"
    return "Could not retrieve position."

# --- Main Execution ---
if __name__ == "__main__":
    uvicorn_thread = threading.Thread(
        target=uvicorn.run,
        args=(app,),
        kwargs={"host": "0.0.0.0", "port": 8100},
        daemon=True,
    )
    uvicorn_thread.start()
    logger.info("Web server started. Log endpoint available at http://localhost:8100/logs")

    try:
        logger.info("Initializing connection with Arduino...")
        board.red_LED(); time.sleep(0.5)
        board.yellow_LED(); time.sleep(0.5)
        board.off()
        logger.info("Arduino Connected. Starting MCP Server.")
        
        ArduinoMCP.run()

    except (KeyboardInterrupt, serial.SerialException) as e:
        if isinstance(e, serial.SerialException):
            logger.error(f"Could not connect to Arduino on {PORT}. Please check the port and connection.")
        else:
            logger.info("Shutting down...")
    finally:
        board.close()