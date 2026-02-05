import { useMemo } from "react";
import { ReactP5Wrapper } from "react-p5-wrapper";

function MovementSketch({ positions, gotoCoords, heatmapMode }) {
  const sketch = useMemo(() => {
    // Helper function to map a value to a color
    function getHeatmapColor(p, value, min, max) {
      if (value === undefined) {
        return p.color(20, 20, 20, 200); // Default color for missing data
      }
      const valueMap = p.constrain(value, min, max);
      const r = p.map(valueMap, min, max, 50, 255);
      const b = p.map(valueMap, min, max, 255, 50);
      return p.color(r, 100, b, 200);
    }

    return (p) => {
      let rotX = -p.PI / 6;
      let rotY = p.PI / 6;
      let zoom = 1.0;
      let lastMouseX, lastMouseY;
      let currentGoto = { x: 0, y: 0, z: 0 };
      let currentPositions = []; // Store positions locally
      const scaleFactor = 10; // Adjust this value to scale the visualization

      p.setup = () => {
        p.createCanvas(p.windowWidth / 2.5, 400, p.WEBGL);
        currentPositions = positions;
      };

      p.updateWithProps = (props) => {
        if (props.positions) {
          currentPositions = props.positions;
        }
        if (props.gotoCoords) {
          currentGoto = props.gotoCoords;
        }
        // heatmapMode is a string, so it's fine without a deep copy/check
      };

      p.mousePressed = () => {
        if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
          lastMouseX = p.mouseX;
          lastMouseY = p.mouseY;
        }
      }

      p.mouseDragged = () => {
        if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
          rotY += (p.mouseX - lastMouseX) * 0.01;
          rotX += (p.mouseY - lastMouseY) * 0.01;
          lastMouseX = p.mouseX;
          lastMouseY = p.mouseY;
        }
      };

      p.mouseWheel = (event) => {
        if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
          if (event.delta > 0) {
            zoom *= 1.1;
          } else {
            zoom *= 0.9;
          }
          return false; // prevent page scrolling
        }
      }

      p.draw = () => {
        p.background(250, 250, 250);

        p.translate(0, 0, -200 * zoom);
        p.rotateX(rotX);
        p.rotateY(rotY);

        // Draw axes
        p.push();
        p.strokeWeight(1);
        p.stroke(255, 0, 0, 150); p.line(0, 0, 0, 150, 0, 0);
        p.stroke(0, 255, 0, 150); p.line(0, 0, 0, 0, 150, 0);
        p.stroke(0, 0, 255, 150); p.line(0, 0, 0, 0, 0, 150);
        p.pop();

        p.noFill();

        const dataKey = heatmapMode === 'temp' ? 'temp' : 'humidity';
        const values = currentPositions.map(p => p[dataKey]).filter(v => v !== undefined);
        console.log("Values for heatmap:", values);
        const defaultMin = dataKey === 'temp' ? 15 : 40;
        const defaultMax = dataKey === 'temp' ? 35 : 80;
        const minVal = values.length > 0 ? Math.min(...values) : defaultMin;
        const maxVal = values.length > 0 ? Math.max(...values) : defaultMax;

        p.strokeWeight(4);

        for (let i = 0; i < currentPositions.length - 1; i++) {
          const pos1 = currentPositions[i];
          const pos2 = currentPositions[i + 1];

          const startColor = getHeatmapColor(p, pos1[dataKey], minVal, maxVal);
          const endColor = getHeatmapColor(p, pos2[dataKey], minVal, maxVal);

          const segments = 5;

          for (let j = 0; j < segments; j++) {
            const amt1 = j / segments;
            const amt2 = (j + 1) / segments;

            const c = p.lerpColor(startColor, endColor, amt1);
            p.stroke(c);

            const x1 = pos1.x * scaleFactor;
            const y1 = pos1.y * scaleFactor;
            const z1 = pos1.z * scaleFactor;
            const x2 = pos2.x * scaleFactor;
            const y2 = pos2.y * scaleFactor;
            const z2 = pos2.z * scaleFactor;

            const sx = p.lerp(x1, x2, amt1);
            const sy = p.lerp(y1, y2, amt1);
            const sz = p.lerp(z1, z2, amt1);

            const ex = p.lerp(x1, x2, amt2);
            const ey = p.lerp(y1, y2, amt2);
            const ez = p.lerp(z1, z2, amt2);

            p.line(sx, sy, sz, ex, ey, ez);
          }
        }

        // Draw target location
        p.push();
        p.noStroke();
        p.fill(0, 0, 255, 100);
        p.translate(currentGoto.x * scaleFactor, currentGoto.y * scaleFactor, currentGoto.z * scaleFactor);
        p.sphere(1 * scaleFactor);
        p.pop();

      };
    }
  }, [heatmapMode]); // Re-create the sketch if the mode changes

  return <ReactP5Wrapper sketch={sketch} positions={positions} gotoCoords={gotoCoords} />;
}

export default MovementSketch;
