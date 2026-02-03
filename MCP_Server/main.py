from fastmcp import FastMCP # This is the MCP Library

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import serial
import threading
import time
import queue
import logging

from typing import Optional, Callable, Any, Dict

logger = logging.getLogger("devaiot-mcp")
logger.setLevel(logging.DEBUG)


PORT='COM5' # Change to your COM port

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

    # HS3003
    hs3003_t_c: Optional[float] = None
    hs3003_h_rh: Optional[float] = None

    # LPS22HB
    lps22hb_p_kpa: Optional[float] = None
    lps22hb_t_c: Optional[float] = None

    # APDS9960
    apds_prox: Optional[int] = None
    apds_color: Optional[ApdsColor] = None
    apds_gesture: Optional[int] = None  # raw code

    # IMU
    acc_g: Optional[Vec3] = None
    gyro_dps: Optional[Vec3] = None
    mag_uT: Optional[Vec3] = None



def parse_packet(line: str) -> Optional[SensorPacket]:
    try:
        obj = json.loads(line)  # type: Dict[str, Any]
    except Exception:
        return None

    return SensorPacket(
        timestamp=datetime.now(timezone.utc),

        hs3003_t_c=obj.get("hs3003_t_c"),
        hs3003_h_rh=obj.get("hs3003_h_rh"),

        lps22hb_p_kpa=obj.get("lps22hb_p_kpa"),
        lps22hb_t_c=obj.get("lps22hb_t_c"),

        apds_prox=obj.get("apds_prox"),
        apds_color=obj.get("apds_color"),
        apds_gesture=obj.get("apds_gesture"),

        acc_g=obj.get("acc_g"),
        gyro_dps=obj.get("gyro_dps"),
        mag_uT=obj.get("mag_uT"),
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

    def get_state(self) -> Optional[SensorPacket]:
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

    def _read_loop(self) -> None:
        while self._running:
            raw = self.ser.readline()
            if not raw:
                continue

            line = raw.decode(errors="replace").strip()
            pkt = parse_packet(line)
            if pkt is not None:
                if self.on_packet:
                    self.on_packet(pkt)
                self._set_latest_package(pkt)

            else:
                if self.debug_nonjson:
                    logging.info("NONJSON: " + str(line))
                    pass

    def close(self) -> None:
        self._running = False
        time.sleep(0.1)
        try:
            self.ser.close()
        except Exception:
            pass



def show(p: SensorPacket) -> None:
    return
    logger.info(
        "{} | T={}C H={}% P={}kPa acc={} gyro={} mag={} prox={} color={} gest={}".format(
            p.timestamp.isoformat(),
            None if p.hs3003_t_c is None else round(p.hs3003_t_c, 2),
            None if p.hs3003_h_rh is None else round(p.hs3003_h_rh, 1),
            None if p.lps22hb_p_kpa is None else round(p.lps22hb_p_kpa, 3),
            p.acc_g, p.gyro_dps, p.mag_uT,
            p.apds_prox, p.apds_color, p.apds_gesture
        )
    )


board = Nano33SenseRev2(PORT, on_packet=show, debug_nonjson=True)  # <-- vaihda portti


ArduinoMCP = FastMCP('Arduino Servers')


# @ArduinoMCP.tool is a python decorator which is wrapping our functions to be exposed to the MCP Client

@ArduinoMCP.tool
def red_led_ON():
    '''Turns on red LED in the Arduino'''
    board.red_LED(); time.sleep(2)
    board.off()
    return 'Red LED could not be turned on – exept for two seconds'

@ArduinoMCP.tool
def led_OFF():
    '''Turns off all LEDs in the Arduino'''
    board.off()
    return 'All LEDs OFF'

@ArduinoMCP.tool
def get_current_temperature():
    '''Gets the most recent temperature from the Arduino'''
    state = board.get_state()
    if state:
        return str(state.hs3003_t_c) + ' degrees celsius'
    else:
        return None

@ArduinoMCP.tool
def get_current_gyro():
    '''Gets the most recent temperature from the Arduino'''
    state = board.get_state()
    if state:
        return str(state.gyro_dps)
    else:
        return None

@ArduinoMCP.tool
def get_current_accelerometer():
    '''Gets the most recent temperature from the Arduino'''
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
    
    try:
        
        # For demonstrating that Arduino is connected
        board.red_LED(); time.sleep(1)
        board.yellow_LED(); time.sleep(1)
        board.off()
        
        # Runs the MCP server 
        ArduinoMCP.run()

        # If you want to host via http:
        #ArduinoMCP.run(transport="http", host="127.0.0.1", port=8000)
    except KeyboardInterrupt:
        board.close()
        pass
    finally:
        board.close()
