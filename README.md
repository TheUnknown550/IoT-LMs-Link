# IoT Large Language Model Interface

This project demonstrates an end-to-end system for controlling an IoT device (Arduino Nano 33 BLE Sense) using a Large Language Model (LLM) and visualizing its sensor data in real-time through a web interface.

## Features

-   **LLM Control**: Utilizes the `fastmcp` library to expose device functions (like `goto_target`, `get_current_temperature`) as tools for a Large Language Model.
-   **Real-time Sensor Monitoring**: Streams sensor data (position, temperature, humidity) from the Arduino to a central server.
-   **Web-based Visualization**: A React-based frontend provides a live log stream and a 3D visualization of the device's movement using p5.js.
-   **Mocked Device Mode**: Includes a mocked server for frontend development without requiring a physical Arduino device.
-   **Serial Communication**: The server communicates with the Arduino over a serial connection.

## Project Structure

The project is organized into four main components:

```
.
├── Calculating_Cordinates/  # Placeholder for coordinate processing logic
├── IoT_Device/              # Arduino firmware
├── MCP_Server/              # Python backend server (LLM interface & web server)
└── visualise_website/       # React frontend for visualization and control
```

-   **`IoT_Device`**: Contains the PlatformIO project for the Arduino Nano 33 BLE Sense. The firmware reads sensor data and listens for commands from the `MCP_Server`.
-   **`MCP_Server`**: A Python server built with `FastAPI` and `fastmcp`. It acts as a bridge between the LLM, the web interface, and the Arduino.
-   **`visualise_website`**: A modern React application built with Vite for real-time data display and 3D visualization.
-   **`Calculating_Cordinates`**: Intended for more complex coordinate calculations and data processing. The current implementation is a placeholder.

## Setup and Installation

### 1. Arduino Firmware (`IoT_Device`)

This component requires the [PlatformIO IDE](https://platformio.org/platformio-ide) (either the VSCode extension or the command-line tool).

1.  **Navigate to the directory**:
    ```bash
    cd IoT_Device
    ```
2.  **Install dependencies**: PlatformIO will automatically install the required libraries listed in `platformio.ini` on the first build.
3.  **Build and Upload**: Connect your Arduino Nano 33 BLE board and use the PlatformIO "Upload" command.

### 2. Backend Server (`MCP_Server`)

The server runs on Python.

1.  **Navigate to the directory**:
    ```bash
    cd MCP_Server
    ```
2.  **Create a virtual environment** (recommended):
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
    ```
3.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
4.  **Run the server**:
    *   **With a physical device**: Update the `PORT` in `main.py` to your Arduino's serial port, then run:
        ```bash
        python main.py
        ```
    *   **For development (no device)**: Run the mocked server, which generates random data:
        ```bash
        python mocked_main.py
        ```
    The server will be available at `http://localhost:8100`.

### 3. Frontend (`visualise_website`)

The frontend requires Node.js and npm.

1.  **Navigate to the directory**:
    ```bash
    cd visualise_website
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Run the development server**:
    ```bash
    npm run dev
    ```
    The web application will be available at `http://localhost:5173` (or another port if 5173 is in use). It connects to the `MCP_Server` at `http://localhost:8100` by default.

## Usage

1.  **Start the hardware**: Ensure the Arduino is running the `IoT_Device` firmware and is connected to your computer.
2.  **Start the backend**: Run the `MCP_Server` in either normal or mocked mode.
3.  **Launch the frontend**: Start the `visualise_website` development server.
4.  **Interact**:
    *   Open the web application in your browser.
    *   View the live log stream from the server.
    *   Watch the 3D visualization of the device's position.
    *   Use the "GOTO Control" form to send movement commands to the device.
    *   (If connected to an LLM) Use the `fastmcp` tools to control the device programmatically through natural language.
