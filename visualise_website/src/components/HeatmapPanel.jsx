import { useEffect, useRef, useMemo, useState } from "react";

const COLS = 40;
const ROWS = 40;
const GRID_MIN = -20;
const GRID_MAX = 20;
const GRID_RANGE = GRID_MAX - GRID_MIN;
const CELL_SIZE = GRID_RANGE / COLS;
const MAX_PATH_LENGTH = 600;

const clampToDomain = (value) => Math.max(GRID_MIN, Math.min(GRID_MAX, value));

const toGridIndex = (value, size) => {
    const clamped = clampToDomain(value);
    const normalised = (clamped - GRID_MIN) / GRID_RANGE;
    const index = Math.round(normalised * size);
    if (Number.isNaN(index)) return 0;
    return Math.max(0, Math.min(size - 1, index));
};

const formatLabel = (value) => {
    if (Math.abs(value) < 1) return "0";
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(1);
};

const getHeatmapColor = (value, min, max) => {
    if (!Number.isFinite(value)) return null;
    if (max === min) return "rgba(50, 100, 255, 0.78)";
    const constrained = Math.max(min, Math.min(max, value));
    const ratio = (constrained - min) / (max - min);
    const r = Math.round(50 + ratio * (255 - 50));
    const b = Math.round(50 + (1 - ratio) * (255 - 50));
    return `rgba(${r}, 100, ${b}, 0.78)`;
};

function HeatmapPanel({ positions }) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const canvasRefs = {
        temp: useRef(null),
        humidity: useRef(null),
        tempModal: useRef(null),
        humidityModal: useRef(null),
    };

    // Grid data for each sensor type
    const gridData = useMemo(() => {
        const tempGrid = Array(COLS).fill(0).map(() => Array(ROWS).fill(0));
        const humGrid = Array(COLS).fill(0).map(() => Array(ROWS).fill(0));

        const path = [];

        positions.forEach((pos) => {
            // Map world coords (-100..100) → grid (0..9) using x and y only
            const c = toGridIndex(pos.x, COLS);
            const r = toGridIndex(pos.y, ROWS);

            tempGrid[c][r] = pos.temp;
            humGrid[c][r] = pos.humidity;

            path.push({ x: c, y: r });
        });

        // Limit path length
        const trimmedPath = path.slice(-MAX_PATH_LENGTH);

        // Current position is last position
        const currentPos = positions.length > 0
            ? {
                c: toGridIndex(positions[positions.length - 1].x, COLS),
                r: toGridIndex(positions[positions.length - 1].y, ROWS)
            }
            : null;

        const columnLabels = Array.from({ length: COLS }, (_, c) => {
            if (c === COLS - 1) return GRID_MAX;
            return GRID_MIN + CELL_SIZE * c;
        });

        const rowLabels = Array.from({ length: ROWS }, (_, r) => {
            if (r === ROWS - 1) return GRID_MAX;
            return GRID_MIN + CELL_SIZE * r;
        });

        return {
            tempGrid,
            humGrid,
            path: trimmedPath,
            currentPos,
            columnLabels,
            rowLabels,
        };
    }, [positions]);

    useEffect(() => {
        const panels = [
            { ref: canvasRefs.temp, grid: gridData.tempGrid, min: 15, max: 35, title: "Temperature" },
            { ref: canvasRefs.humidity, grid: gridData.humGrid, min: 30, max: 90, title: "Humidity" },
            { ref: canvasRefs.tempModal, grid: gridData.tempGrid, min: 15, max: 35, title: "Temperature" },
            { ref: canvasRefs.humidityModal, grid: gridData.humGrid, min: 30, max: 90, title: "Humidity" },
        ];

        panels.forEach(({ ref, grid, min, max }) => {
            const canvas = ref.current;
            if (!canvas) return;

            const ctx = canvas.getContext("2d");
            const { width, height } = canvas;
            const scale = width / COLS;

            // Clear canvas
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);

            // Draw heatmap
            for (let i = 0; i < COLS; i++) {
                for (let j = 0; j < ROWS; j++) {
                    const v = grid[i][j];
                    if (v === 0) continue;

                    const color = getHeatmapColor(v, min, max);
                    if (!color) continue;

                    ctx.fillStyle = color;
                    ctx.fillRect(i * scale, j * scale, scale, scale);
                }
            }

            // Draw grid lines
            ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
            ctx.lineWidth = 1;

            for (let i = 0; i <= COLS; i++) {
                ctx.beginPath();
                ctx.moveTo(i * scale, 0);
                ctx.lineTo(i * scale, height);
                ctx.stroke();
            }

            for (let j = 0; j <= ROWS; j++) {
                ctx.beginPath();
                ctx.moveTo(0, j * scale);
                ctx.lineTo(width, j * scale);
                ctx.stroke();
            }

            // Draw labels
            ctx.fillStyle = "#000000";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Column numbers (top)
            for (let c = 0; c < COLS; c++) {
                ctx.fillText(formatLabel(gridData.columnLabels[c]), c * scale + scale / 2, scale * 0.2);
            }

            // Row numbers (left)
            for (let r = 0; r < ROWS; r++) {
                ctx.save();
                ctx.translate(scale * 0.2, r * scale + scale / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.fillText(formatLabel(gridData.rowLabels[r]), 0, 0);
                ctx.restore();
            }

            // Draw path
            if (gridData.path.length > 1) {
                ctx.strokeStyle = "rgba(255, 200, 0, 0.8)";
                ctx.lineWidth = 2;
                ctx.beginPath();

                gridData.path.forEach((p, idx) => {
                    const x = p.x * scale + scale / 2;
                    const y = p.y * scale + scale / 2;

                    if (idx === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });

                ctx.stroke();
            }

            // Draw drone
            if (gridData.currentPos) {
                ctx.fillStyle = "#ff0000";
                ctx.beginPath();
                ctx.arc(
                    gridData.currentPos.c * scale + scale / 2,
                    gridData.currentPos.r * scale + scale / 2,
                    5,
                    0,
                    2 * Math.PI
                );
                ctx.fill();
            }
        });
    }, [gridData, isModalOpen]);

    const openModal = () => setIsModalOpen(true);
    const closeModal = () => setIsModalOpen(false);
    const handleBackdropClick = (event) => {
        if (event.target === event.currentTarget) {
            closeModal();
        }
    };

    return (
        <>
            <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-2xl p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">2D Heatmap Panels</h2>
                    <button
                        type="button"
                        onClick={openModal}
                        className="rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-300"
                    >
                        Expand
                    </button>
                </div>
                <div
                    role="button"
                    tabIndex={0}
                    onClick={openModal}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") openModal();
                    }}
                    className="grid grid-cols-2 gap-4 cursor-zoom-in"
                >
                    <div className="flex flex-col">
                        <span className="mb-2 text-sm font-semibold text-slate-600">Temperature</span>
                        <canvas
                            ref={canvasRefs.temp}
                            width={400}
                            height={400}
                            className="w-full border border-slate-300 rounded"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="mb-2 text-sm font-semibold text-slate-600">Humidity</span>
                        <canvas
                            ref={canvasRefs.humidity}
                            width={400}
                            height={400}
                            className="w-full border border-slate-300 rounded"
                        />
                    </div>
                </div>
                <div className="mt-3 text-xs text-slate-600 flex gap-4 justify-center">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span>Drone position</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <span>Path trail</span>
                    </div>
                </div>
            </div>

            {isModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
                    onMouseDown={handleBackdropClick}
                >
                    <div className="w-full max-w-6xl rounded-3xl bg-white shadow-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-2xl font-semibold text-slate-800">Expanded Heatmap Panels</h3>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-300"
                            >
                                Close
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <div className="flex flex-col">
                                <span className="mb-3 text-base font-semibold text-slate-600">Temperature</span>
                                <canvas
                                    ref={canvasRefs.tempModal}
                                    width={720}
                                    height={720}
                                    className="w-full border border-slate-300 rounded-lg"
                                />
                            </div>
                            <div className="flex flex-col">
                                <span className="mb-3 text-base font-semibold text-slate-600">Humidity</span>
                                <canvas
                                    ref={canvasRefs.humidityModal}
                                    width={720}
                                    height={720}
                                    className="w-full border border-slate-300 rounded-lg"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default HeatmapPanel;
