import json
import random
import time
from datetime import datetime, timezone
from fastmcp import FastMCP
import threading
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from collections import deque
from pydantic import BaseModel

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# We will store logs in a deque and expose them via an API endpoint
LOG_DEQUE = deque(maxlen=300)

# --- Mocked Data Generation ---

# Store the target location for the GOTO function
target_location = None
current_position = {"x": 0.0, "y": 0.0, "z": 0.0}

def generate_sensor_data():
    """Generates a dictionary of random sensor data."""
    global current_position
    
    if target_location:
        # Move current position towards target
        for axis in ["x", "y", "z"]:
            if abs(current_position[axis] - target_location[axis]) > 0.1:
                if current_position[axis] < target_location[axis]:
                    current_position[axis] += 1
                elif current_position[axis] > target_location[axis]:
                    current_position[axis] -= 1
            # Add some random jitter
            current_position[axis] += random.uniform(-0.5, 0.5)


    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "position": {
            "x": round(current_position["x"], 2),
            "y": round(current_position["y"], 2),
            "z": round(current_position["z"], 2)
        },
        "temperature": round(random.uniform(20.0, 30.0), 2),
        "humidity": round(random.uniform(40.0, 60.0), 2),
        "pressure": round(random.uniform(1000.0, 1020.0), 2),
    }

# --- MCP Server Setup ---

MockedArduinoMCP = FastMCP('Mocked Arduino Server')


def goto_target(x: float, y: float, z: float):
    """Sets the target coordinates for the mocked device and resets the current position."""
    global target_location, current_position
    target_location = {"x": x, "y": y, "z": z}
    current_position = {"x": 0.0, "y": 0.0, "z": 0.0}
    log_message = f"GOTO target set to: x={x}, y={y}, z={z}. Position reset to origin."
    logging.info(log_message)
    log_line = f"{datetime.now(timezone.utc).isoformat()}Z INFO {log_message}"
    LOG_DEQUE.append(log_line)
    return f"GOTO target set to: x={x}, y={y}, z={z}. Position reset."

@MockedArduinoMCP.tool
def get_sensor_data():
    """Returns the latest generated sensor data."""
    return json.dumps(generate_sensor_data())

@MockedArduinoMCP.tool
def get_current_temperature():
    """Gets the most recent temperature from the mocked device."""
    return f"{generate_sensor_data()['temperature']} degrees celsius"

@MockedArduinoMCP.tool
def get_current_position():
    """Gets the most recent position from the mocked device."""
    pos = generate_sensor_data()['position']
    return f"x={pos['x']:.2f}, y={pos['y']:.2f}, z={pos['z']:.2f}"


def data_generation_loop():
    """A loop to continuously generate data in the background and log it."""
    while True:
        if target_location:
            sensor_data = generate_sensor_data()
            pos = sensor_data["position"]
            temp = sensor_data["temperature"]
            humidity = sensor_data["humidity"]
            
            message = f"POSITION x={pos['x']:.2f}, y={pos['y']:.2f}, z={pos['z']:.2f} | TEMP={temp:.1f}C | HUMIDITY={humidity:.1f}% |"
            
            # Use a timestamp format compatible with the frontend parser
            ts = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

            log_line = f"{ts} INFO {message}"
            LOG_DEQUE.append(log_line)
            logging.info(message)
        time.sleep(2.5)

# --- Web Server Setup ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.get("/logs")
def get_logs(limit: int = 300):
    """Returns the last `limit` log lines."""
    return {"lines": list(LOG_DEQUE)}

class GotoCoords(BaseModel):
    x: float
    y: float
    z: float

@app.post("/mcp/goto_target")
def handle_goto_target(coords: GotoCoords):
    """API endpoint to set the target coordinates for the mocked device."""
    # This manually implements the logic of the goto_target tool
    # to ensure the endpoint works, bypassing the fastmcp http layer.
    global target_location, current_position
    target_location = {"x": coords.x, "y": coords.y, "z": coords.z}
    current_position = {"x": 0.0, "y": 0.0, "z": 0.0}
    log_message = f"GOTO target set to: x={coords.x}, y={coords.y}, z={coords.z}. Position reset to origin."
    logging.info(log_message)
    log_line = f"{datetime.now(timezone.utc).isoformat()}Z INFO {log_message}"
    LOG_DEQUE.append(log_line)
    return f"GOTO target set to: x={coords.x}, y={coords.y}, z={coords.z}. Position reset."

# Mount the MCP server as a sub-application
# mcp_app = MockedArduinoMCP.http_app()
# app.mount("/mcp", mcp_app)


if __name__ == "__main__":
    log_message = "Starting Mocked MCP Server..."
    logging.info(log_message)
    log_line = f"{datetime.now(timezone.utc).isoformat()}Z INFO {log_message}"
    LOG_DEQUE.append(log_line)

    # Start the data generation loop in a background thread
    data_thread = threading.Thread(target=data_generation_loop, daemon=True)
    data_thread.start()

    # Run the web server
    # The MCP server is now available at http://localhost:8100/mcp
    # The logs are available at http://localhost:8100/logs
    uvicorn.run(app, host="0.0.0.0", port=8100)
