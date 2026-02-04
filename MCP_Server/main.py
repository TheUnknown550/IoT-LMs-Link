from fastmcp import FastMCP  # This is the MCP Library

from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json
import logging
import queue
import serial
import threading
import time
from typing import Optional, Callable, Any, Dict, List, Union

logger = logging.getLogger("devaiot-mcp")
logger.setLevel(logging.DEBUG)

PORT = 'COM5'  # Change to your COM port
LOG_PATH = Path(__file__).parent / "logs" / "mcp.log"


def configure_logging() -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("%(asctime)sZ %(levelname)s %(message)s")

    file_handler = RotatingFileHandler(LOG_PATH, maxBytes=1_000_000, backupCount=3)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)


configure_logging()


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
    """Represents a single line coming from the Arduino."""

    timestamp: datetime
    raw_line: str
    raw_json: Optional[Dict[str, Any]] = None
    kind: str = "text"  # json | ack | err | text | info

    # Legacy/other sensors
    hs3003_t_c: Optional[float] = None
    hs3003_h_rh: Optional[float] = None
    lps22hb_p_kpa: Optional[float] = None
    lps22hb_t_c: Optional[float] = None
    apds_prox: Optional[int] = None
    apds_color: Optional[ApdsColor] = None
    apds_gesture: Optional[int] = None  # raw code
    acc_g: Optional[Vec3] = None
    gyro_dps: Optional[Vec3] = None
    mag_uT: Optional[Vec3] = None

    # IoT_Device main.cpp fields
    temp_c: Optional[float] = None
    humidity_rh: Optional[float] = None
    position: Optional[Dict[str, Any]] = None
    distance_to_target: Optional[float] = None
    ack: Optional[str] = None
    error: Optional[str] = None
    info: Optional[str] = None


def _as_vec3(val: Any) -> Optional[Vec3]:
    """Convert list/tuple to Vec3 if possible."""
    try:
        if isinstance(val, Vec3):
            return val
        if isinstance(val, (list, tuple)) and len(val) == 3:
            return Vec3(float(val[0]), float(val[1]), float(val[2]))
    except Exception:
        return None
    return None


def _parse_nonjson_line(ts: datetime, line: str) -> SensorPacket:
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
        dist: Optional[float] = None
        try:
            after_colon = line.split(":", 1)[1]
            num_part = after_colon.strip().split(" ")[0]
            dist = float(num_part)
        except Exception:
            dist = None
        return SensorPacket(timestamp=ts, raw_line=line, kind="info", distance_to_target=dist, info=line)

    return SensorPacket(timestamp=ts, raw_line=line, kind="text", info=line)


def parse_packet(line: str) -> Optional[SensorPacket]:
    if line == "":
        return None

    ts = datetime.now(timezone.utc)
    try:
        obj = json.loads(line)
    except Exception:
        return _parse_nonjson_line(ts, line)

    if not isinstance(obj, dict):
        return SensorPacket(timestamp=ts, raw_line=line, raw_json=obj, kind="json")

    position = obj.get("position") if isinstance(obj.get("position"), dict) else None

    return SensorPacket(
        timestamp=ts,
        raw_line=line,
        raw_json=obj,
        kind="json",
        hs3003_t_c=obj.get("hs3003_t_c"),
        hs3003_h_rh=obj.get("hs3003_h_rh") or obj.get("humidity_rh"),
        lps22hb_p_kpa=obj.get("lps22hb_p_kpa"),
        lps22hb_t_c=obj.get("lps22hb_t_c"),
        apds_prox=obj.get("apds_prox"),
        apds_color=obj.get("apds_color"),
        apds_gesture=obj.get("apds_gesture"),
        acc_g=_as_vec3(obj.get("acc_g")),
        gyro_dps=_as_vec3(obj.get("gyro_dps")),
        mag_uT=_as_vec3(obj.get("mag_uT")),
        temp_c=obj.get("temp_c") or obj.get("hs3003_t_c"),
        humidity_rh=obj.get("humidity_rh") or obj.get("hs3003_h_rh"),
        position=position,
        distance_to_target=obj.get("distance_to_target"),
    )


def clear_queue(q: queue.Queue):
    while True:
        try:
            q.get_nowait()
            q.task_done()
        except queue.Empty:
            break


class Nano33SenseRev2:
    def __init__(
        self,
        port: str,
        baud: int = 115200,
        on_packet: Optional[Callable[[SensorPacket], None]] = None,
        debug_nonjson: bool = False,
    ):
        self.ser = serial.Serial(port, baud, timeout=1)
        self.on_packet = on_packet
        self.debug_nonjson = debug_nonjson
        self._running = True

        self._latest_pkt = queue.Queue(maxsize=1)
        self._latest_sensor = queue.Queue(maxsize=1)

        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    # ----- commands -----
    def led_on(self) -> None:
        self._send("LED=ON")

    def led_off(self) -> None:
        self._send("LED=OFF")

    def rgb(self, r: int, g: int, b: int) -> None:
        r = max(0, min(255, int(r)))
        g = max(0, min(255, int(g)))
        b = max(0, min(255, int(b)))
        self._send("RGB={},{},{}".format(r, g, b))

    def red_LED(self) -> None:
        self.rgb(255, 0, 0)

    # TODO: Implement blue led

    def yellow_LED(self) -> None:
        self.rgb(255, 255, 0)

    def off(self) -> None:
        self.rgb(0, 0, 0)

    def goto(self, x: float, y: float, z: float) -> None:
        self._send(f"GOTO={x},{y},{z}")

    def get_state(self) -> Optional[SensorPacket]:
        try:
            value = self._latest_sensor.get(timeout=2)
            self._latest_sensor.task_done()
            return value
        except queue.Empty:
            return None

    def get_latest_packet(self) -> Optional[SensorPacket]:
        try:
            value = self._latest_pkt.get(timeout=2)
            self._latest_pkt.task_done()
            return value
        except queue.Empty:
            return None

    # ----- internals -----
    def _send(self, msg: str) -> None:
        if not msg.endswith("\n"):
            msg += "\n"
        self.ser.write(msg.encode("utf-8"))

    def _set_latest_package(self, pkt: SensorPacket) -> None:
        clear_queue(self._latest_pkt)
        self._latest_pkt.put(pkt, block=False)
        if pkt.kind == "json":
            clear_queue(self._latest_sensor)
            self._latest_sensor.put(pkt, block=False)

    def _read_loop(self) -> None:
        while self._running:
            raw = self.ser.readline()
            if not raw:
                continue

            line = raw.decode(errors="replace").strip()
            if line == "":
                continue

            pkt = parse_packet(line)
            if pkt is not None:
                if self.on_packet:
                    self.on_packet(pkt)
                self._set_latest_package(pkt)
            else:
                if self.debug_nonjson:
                    logger.info("NONJSON: %s", str(line))

    def close(self) -> None:
        self._running = False
        time.sleep(0.1)
        try:
            self.ser.close()
        except Exception:
            pass


def _vec_to_list(v: Optional[Vec3]) -> Optional[List[float]]:
    if isinstance(v, Vec3):
        return [v.x, v.y, v.z]
    return v


def packet_to_dict(p: SensorPacket) -> Dict[str, Any]:
    return {
        "timestamp": p.timestamp.isoformat(),
        "kind": p.kind,
        "raw_line": p.raw_line,
        "raw_json": p.raw_json,
        "hs3003_t_c": p.hs3003_t_c,
        "hs3003_h_rh": p.hs3003_h_rh,
        "lps22hb_p_kpa": p.lps22hb_p_kpa,
        "lps22hb_t_c": p.lps22hb_t_c,
        "apds_prox": p.apds_prox,
        "apds_color": p.apds_color,
        "apds_gesture": p.apds_gesture,
        "acc_g": _vec_to_list(p.acc_g),
        "gyro_dps": _vec_to_list(p.gyro_dps),
        "mag_uT": _vec_to_list(p.mag_uT),
        "temp_c": p.temp_c,
        "humidity_rh": p.humidity_rh,
        "position": p.position,
        "distance_to_target": p.distance_to_target,
        "ack": p.ack,
        "error": p.error,
        "info": p.info,
    }


def show(p: SensorPacket) -> None:
    payload = packet_to_dict(p)
    logger.info(json.dumps(payload, default=str))


def read_tail(path: Path, limit: int = 200) -> List[str]:
    try:
        with path.open("r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except FileNotFoundError:
        return []
    return [line.rstrip("\n") for line in lines[-limit:]]


class LogRequestHandler(BaseHTTPRequestHandler):
    def _set_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/logs", "/logs/"):
            self.send_response(404)
            self._set_cors()
            self.end_headers()
            return

        qs = parse_qs(parsed.query)
        try:
            limit = int(qs.get("limit", ["200"])[0])
        except Exception:
            limit = 200
        limit = max(1, min(limit, 2000))

        body = {"lines": read_tail(LOG_PATH, limit)}
        encoded = json.dumps(body).encode("utf-8")

        self.send_response(200)
        self._set_cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format, *args):  # noqa: A003
        # silence default stdout logging for cleanliness
        return


def start_log_http_server(port: int = 8100) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("0.0.0.0", port), LogRequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Log endpoint available at http://localhost:%s/logs", port)
    return server


board = Nano33SenseRev2(PORT, on_packet=show, debug_nonjson=True)  # <-- change port if needed
ArduinoMCP = FastMCP('Arduino Servers')


# @ArduinoMCP.tool is a python decorator which is wrapping our functions to be exposed to the MCP Client

@ArduinoMCP.tool
def red_led_ON():
    '''Turns on red LED in the Arduino'''
    board.red_LED(); time.sleep(2)
    board.off()
    return 'Red LED could not be turned on - except for two seconds'


@ArduinoMCP.tool
def led_OFF():
    '''Turns off all LEDs in the Arduino'''
    board.off()
    return 'All LEDs OFF'


@ArduinoMCP.tool
def goto_target(x: float, y: float, z: float):
    '''Sets the target coordinates on the Arduino (meters).'''
    board.goto(x, y, z)
    return f"GOTO sent: {x}, {y}, {z}"


@ArduinoMCP.tool
def get_current_temperature():
    '''Gets the most recent temperature from the Arduino'''
    state = board.get_state()
    if state:
        temp = state.temp_c if state.temp_c is not None else state.hs3003_t_c
        if temp is not None:
            return f"{temp} degrees celsius"
    return None


@ArduinoMCP.tool
def get_current_gyro():
    '''Gets the most recent gyroscope reading from the Arduino'''
    state = board.get_state()
    if state:
        return str(state.gyro_dps)
    else:
        return None


@ArduinoMCP.tool
def get_current_accelerometer():
    '''Gets the most recent accelerometer reading from the Arduino'''
    state = board.get_state()
    if state:
        return str(state.acc_g)
    else:
        return None


# TODO: Implement blue led


# Can be used for testing and debugging

def test():
    '''Gets the most recent temperature from the Arduino'''
    state = board.get_state()
    if state:
        return str(state.acc_g)
    else:
        return None


if __name__ == "__main__":
    log_server = None
    try:
        log_server = start_log_http_server(port=8100)

        # For demonstrating that Arduino is connected
        board.red_LED(); time.sleep(1)
        board.yellow_LED(); time.sleep(1)
        board.off()

        # Runs the MCP server
        ArduinoMCP.run()

        # If you want to host via http:
        # ArduinoMCP.run(transport="http", host="127.0.0.1", port=8000)
    except KeyboardInterrupt:
        board.close()
    finally:
        board.close()
        if log_server:
            log_server.shutdown()
