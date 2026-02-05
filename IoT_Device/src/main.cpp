#include <Arduino_HS300x.h>
#include <Arduino_BMI270_BMM150.h>
#include <Arduino_JSON.h>

// ===== CONFIGURABLE CONSTANTS =====
const float SPEED = 1.0;              // Speed in meters per second
const unsigned long REPORT_INTERVAL = 1000;  // Data reporting interval in milliseconds
const float GYRO_DEADBAND = 0.05;     // Gyroscope deadband to prevent drift (radians/s)
const float TARGET_THRESHOLD = 1.0;   // Distance threshold to target in meters
const unsigned long LED_ON_DURATION = 10000;  // LED on duration when target reached (milliseconds)
// ==================================

const int LED_PIN = LED_BUILTIN;
const int RGB_R = LEDR;  // (22u) 
const int RGB_G = LEDG;  // (23u)
const int RGB_B = LEDB;  // (24u)

// Position tracking variables
float pos_x = 0.0, pos_y = 0.0, pos_z = 0.0;
float yaw = 0.0;    // Facing Left/Right (radians)
float pitch = 0.0;  // Facing Up/Down (radians)
unsigned long lastGyroUpdate = 0;

// Target tracking variables
bool hasTarget = false;
float target_x = 0.0, target_y = 0.0, target_z = 0.0;
bool targetReached = false;
unsigned long targetReachedTime = 0;
bool firstCall = true;

String cmd;

static inline void setRgb(uint8_t r, uint8_t g, uint8_t b) {
  // active-low PWM: analogWrite(pin, 255-r)
  analogWrite(RGB_R, 255 - r);
  analogWrite(RGB_G, 255 - g);
  analogWrite(RGB_B, 255 - b);
}

static inline void rgbOff() { setRgb(0, 0, 0); }

// Calculate distance between current position and target
float distanceToTarget() {
  float dx = target_x - pos_x;
  float dy = target_y - pos_y;
  float dz = target_z - pos_z;
  return sqrt(dx*dx + dy*dy + dz*dz);
}

// Update position based on gyroscope readings
void updatePosition() {
  // Only track position when there's an active target
  if (!hasTarget || targetReached) return;

  if (firstCall) {
    lastGyroUpdate = micros();
    firstCall = false;
    return;
  }
  
  if (!IMU.gyroscopeAvailable()) return;
  
  float gx, gy, gz;
  IMU.readGyroscope(gx, gy, gz);
  
  unsigned long now = micros();
  float dt = (now - lastGyroUpdate) / 1000000.0;
  // float dt = 0.01;
  lastGyroUpdate = now;
  
  // Convert gyro readings to radians
  float gyroZ_rad = gz * (PI / 180.0);  // Yaw change
  float gyroY_rad = gy * (PI / 180.0);  // Pitch change
  
  // Update angles with deadband
  if (abs(gyroZ_rad) > GYRO_DEADBAND) yaw += gyroZ_rad * dt;
  if (abs(gyroY_rad) > GYRO_DEADBAND) pitch += gyroY_rad * dt;
  
  // Calculate 3D movement using spherical coordinates
  float dist_z = SPEED * dt * sin(pitch);
  float dist_horizontal = SPEED * dt * cos(pitch);
  float dist_x = dist_horizontal * cos(yaw);
  float dist_y = dist_horizontal * sin(yaw);

  // Update position
  pos_x += dist_x;
  pos_y += dist_y;
  pos_z += dist_z;
  
  // Check if target reached
  if (hasTarget && !targetReached) { 
    float distance = distanceToTarget();
    // Serial.print("Distance to target: ");
    // Serial.print(distance);
    // Serial.println(" m");    Serial.print("Movement: x=");

    
    if (distance <= TARGET_THRESHOLD) {
      targetReached = true;
      targetReachedTime = millis();
      setRgb(255, 0, 0);  // Turn LED RED
      Serial.println("ACK=TARGET_REACHED");
    }
  }
}

void handleCommand(const String& s) {
  if (s == "LED=ON") {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("ACK=LED_ON");
    return;
  }
  if (s == "LED=OFF") {
    digitalWrite(LED_PIN, LOW);
    Serial.println("ACK=LED_OFF");
    return;
  }

  if (s.startsWith("RGB=")) {
    int r = -1, g = -1, b = -1;
    if (sscanf(s.c_str(), "RGB=%d,%d,%d", &r, &g, &b) == 3) {
      r = constrain(r, 0, 255);
      g = constrain(g, 0, 255);
      b = constrain(b, 0, 255);
      setRgb((uint8_t)r, (uint8_t)g, (uint8_t)b);
      Serial.print("ACK=RGB,");
      Serial.print(r); Serial.print(",");
      Serial.print(g); Serial.print(",");
      Serial.println(b);
      return;
    }
    Serial.print("ERR=BAD_RGB,VAL=");
    Serial.println(s);
    return;
  }
  
  // New command: GOTO=x,y,z
  if (s.startsWith("GOTO=")) {
    String coords = s.substring(5);  // Remove "GOTO="
    int comma1 = coords.indexOf(',');
    int comma2 = coords.lastIndexOf(',');
    
    if (comma1 > 0 && comma2 > comma1) {
      float x = coords.substring(0, comma1).toFloat();
      float y = coords.substring(comma1 + 1, comma2).toFloat();
      float z = coords.substring(comma2 + 1).toFloat();
      
      target_x = x;
      target_y = y;
      target_z = z;
      hasTarget = true;
      targetReached = false;
      Serial.print("ACK=TARGET_SET,");
      Serial.print(x); Serial.print(",");
      Serial.print(y); Serial.print(",");
      Serial.println(z);
      return;
    }
    Serial.print("ERR=BAD_GOTO,VAL=");
    Serial.println(s);
    return;
  }

  Serial.print("ERR=UNKNOWN_CMD,VAL=");
  Serial.println(s);
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {}

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  pinMode(RGB_R, OUTPUT);
  pinMode(RGB_G, OUTPUT);
  pinMode(RGB_B, OUTPUT);
  rgbOff();

  bool ok = true;
  if (!HS300x.begin()) { Serial.println("ERR=HS300x_INIT"); ok = false; }
  if (!IMU.begin())    { Serial.println("ERR=IMU_INIT"); ok = false; }

  if (!ok) {
    Serial.println("ERR=INIT_FAILED");
    while (1) {}
  }

  Serial.println("READY");
  Serial.println("Commands: LED=ON|OFF, RGB=R,G,B (0-255), GOTO=x,y,z");
  
  // Initialize gyro update timer
  lastGyroUpdate = micros();
}

void loop() {
  // Update position continuously from gyroscope
  updatePosition();
  
  // Check if LED should be turned off after target reached
  if (targetReached) {
    firstCall = true;
    unsigned long now = millis();
    if (now - targetReachedTime >= LED_ON_DURATION) {
      rgbOff();
      targetReached = false;
      hasTarget = false;  // Clear target after LED turns off
      Serial.println("ACK=TARGET_COMPLETE");
    }
  }
  
  // Read commands
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (cmd.length() > 0) {
        cmd.trim();
        handleCommand(cmd);
        cmd = "";
      }
    } else {
      cmd += c;
      if (cmd.length() > 96) { cmd = ""; Serial.println("ERR=CMD_TOO_LONG"); }
    }
  }

  // Report data at specified interval
  static unsigned long lastReport = 0;
  unsigned long now = millis();
  if (now - lastReport < REPORT_INTERVAL) return;
  lastReport = now;

  JSONVar root;
  
  // Add timestamp
  root["timestamp"] = now;
  
  // Temperature and humidity
  root["temp_c"] = (double)HS300x.readTemperature();
  root["humidity_rh"] = (double)HS300x.readHumidity();
  
  // Current coordinates
  JSONVar pos;
  pos["x"] = pos_x;
  pos["y"] = pos_y;
  pos["z"] = pos_z;
  root["position"] = pos;
  
  // Optional: include target distance if target is set
  if (hasTarget && !targetReached) {
    root["distance_to_target"] = distanceToTarget();
  }

  Serial.println(JSON.stringify(root));
}
