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

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# We will store logs in a deque and expose them via an API endpoint
LOG_DEQUE = deque(maxlen=300)

# --- Mocked Data Generation ---

# Store the target location for the GOTO function
target_location = {"x": 0.0, "y": 0.0, "z": 0.0}
current_position = {"x": 10.0, "y": 10.0, "z": 10.0}

def generate_sensor_data():
    """Generates a dictionary of random sensor data."""
    global current_position
    # Move current position towards target
    for axis in ["x", "y", "z"]:
        if abs(current_position[axis] - target_location[axis]) > 0.1:
            if current_position[axis] < target_location[axis]:
                current_position[axis] += 0.1
            elif current_position[axis] > target_location[axis]:
                current_position[axis] -= 0.1
        # Add some random jitter
        current_position[axis] += random.uniform(-0.05, 0.05)


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

@MockedArduinoMCP.tool
def goto_target(x: float, y: float, z: float):
    """Sets the target coordinates for the mocked device."""
    global target_location
    target_location["x"] = x
    target_location["y"] = y
    target_location["z"] = z
    log_message = f"GOTO target set to: x={x}, y={y}, z={z}"
    logging.info(log_message)
    log_line = f"{datetime.now(timezone.utc).isoformat()}Z INFO {log_message}"
    LOG_DEQUE.append(log_line)
    return f"GOTO target set to: x={x}, y={y}, z={z}"

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
        sensor_data = generate_sensor_data()
        log_message = f"Generated Data: {json.dumps(sensor_data)}"
        logging.info(log_message)
        log_line = f"{datetime.now(timezone.utc).isoformat()}Z INFO {log_message}"
        LOG_DEQUE.append(log_line)
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

# Mount the MCP server as a sub-application
mcp_app = MockedArduinoMCP.http_app(path="/mcp")
app.mount("/mcp", mcp_app)


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
