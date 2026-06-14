import React from "react";
import { PumpConfig, FluidicsConfig } from "../types";
import { Play, Thermometer, Database, CheckCircle, HelpCircle } from "lucide-react";

interface FluidicSchematicProps {
  pumps: PumpConfig[];
  fluidics: FluidicsConfig;
  hubAddr: string;
  hubPort: string;
  r1Heaters: Record<number, string>;
  r2Heaters: Record<number, string>;
  r1Bolus: string;
  r2Bolus: string;
  usedVolumes?: Record<number, number>;
}

export default function FluidicSchematic({
  pumps,
  fluidics,
  hubAddr,
  hubPort,
  r1Heaters,
  r2Heaters,
  r1Bolus,
  r2Bolus,
  usedVolumes = {},
}: FluidicSchematicProps) {
  const isDhActive = hubAddr.trim() !== "0" && hubAddr.trim() !== "";
  const isTwoStep = fluidics.reactor2Vol > 0;

  // Active reagent pumps (addr !== "0")
  const activePumps = pumps.filter((p) => p.addr !== "0");
  const r1Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 1" && p.sweep === "No");
  const r2Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 2");
  const sweepPump = activePumps.find((p) => p.sweep === "Yes");

  // Get active heaters (max temperature for display tooltip)
  const maxR1Temp = Math.max(...Object.values(r1Heaters).map((val) => Number(val) || 0));
  const maxR2Temp = Math.max(...Object.values(r2Heaters).map((val) => Number(val) || 0));

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Live Fluidic Flow Path
          </h3>
        </div>
        <div className="flex gap-4 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-indigo-500"></span> Sweep
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500"></span> Reagent Loop
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-amber-500"></span> Reactor
          </span>
        </div>
      </div>

      {/* SVG Container wrapping the schema with reduced padding */}
      <div className="w-full overflow-x-auto bg-gray-50 border border-gray-100 rounded-lg py-2 px-3">
        <svg
          viewBox="0 -18 1000 278"
          className="w-full min-w-[850px] h-[230px] select-none font-sans"
        >
          {/* Animated Line Gradients and Patterns */}
          <defs>
            <linearGradient id="fluidFlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            <linearGradient id="sweepFlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <linearGradient id="reactorHeat" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>

          {/* MAIN FLOW PIPELINE */}
          {/* Background piping */}
          <line
            x1="300"
            y1="120"
            x2="900"
            y2="120"
            stroke="#e2e8f0"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Active moving flow visual path */}
          <line
            x1="300"
            y1="120"
            x2="850"
            y2="120"
            stroke="url(#fluidFlow)"
            strokeWidth="3"
            strokeDasharray="8 6"
            className="animate-[dash_15s_linear_infinite]"
            style={{ strokeDashoffset: -10 }}
          />

          {/* FLOW SEGMENT LABELS (T1, T2, SW volumes) */}
          {/* Connection Line 1 to 2 */}
          {isTwoStep && (
            <g>
              <rect x="330" y="98" width="110" height="15" rx="3" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="0.5" />
              <text x="385" y="109" fill="#1e3a8a" fontSize="8" fontWeight="bold" textAnchor="middle">
                T1 Line: {fluidics.transfer1Vol} µL
              </text>
            </g>
          )}

          {/* Connection Line 2 to DH or Vial */}
          <g>
            <rect x="580" y="98" width="90" height="15" rx="3" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="0.5" />
            <text x="625" y="109" fill="#1e3a8a" fontSize="8" fontWeight="bold" textAnchor="middle">
              T2 Line: {fluidics.transfer2Vol} µL
            </text>
          </g>

          {isDhActive && (
            <g>
              <rect x="735" y="98" width="90" height="15" rx="3" fill="#f5f3ff" stroke="#ddd6fe" strokeWidth="0.5" />
              <text x="780" y="109" fill="#5b21b6" fontSize="8" fontWeight="bold" textAnchor="middle">
                SW Line: {fluidics.sweepVol} µL
              </text>
            </g>
          )}

          {/* REACTOR 1 BOX */}
          <g transform="translate(200, 95)">
            <rect
              width="100"
              height="50"
              rx="6"
              fill={maxR1Temp > 40 ? "url(#reactorHeat)" : "#fbbf24"}
              stroke={maxR1Temp > 40 ? "#b91c1c" : "#d97706"}
              strokeWidth="2"
              className="drop-shadow-sm"
            />
            {/* Heater thermals indicators */}
            {maxR1Temp > 40 && (
              <circle cx="10" cy="10" r="4" fill="#fff" className="animate-ping" />
            )}
            <text x="50" y="22" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">
              REACTOR 1
            </text>
            <text x="50" y="34" fill="#fff" fontSize="8" textAnchor="middle">
              Vol: {fluidics.reactor1Vol} µL
            </text>
            <text x="50" y="44" fill="#ffedd5" fontSize="8" fontWeight="bold" textAnchor="middle">
              {maxR1Temp ? `${maxR1Temp}°C` : "Ambient"}
            </text>
          </g>

          {/* REACTOR 2 BOX */}
          {isTwoStep ? (
            <g transform="translate(450, 95)">
              <rect
                width="100"
                height="50"
                rx="6"
                fill={maxR2Temp > 40 ? "url(#reactorHeat)" : "#fbbf24"}
                stroke={maxR2Temp > 40 ? "#b91c1c" : "#d97706"}
                strokeWidth="2"
                className="drop-shadow-sm"
              />
              {maxR2Temp > 40 && (
                <circle cx="10" cy="10" r="4" fill="#fff" className="animate-ping" />
              )}
              <text x="50" y="22" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">
                REACTOR 2
              </text>
              <text x="50" y="34" fill="#fff" fontSize="8" textAnchor="middle">
                Vol: {fluidics.reactor2Vol} µL
              </text>
              <text x="50" y="44" fill="#ffedd5" fontSize="8" fontWeight="bold" textAnchor="middle">
                {maxR2Temp ? `${maxR2Temp}°C` : "Ambient"}
              </text>
            </g>
          ) : (
            <g transform="translate(450, 95)">
              <rect
                width="100"
                height="50"
                rx="6"
                fill="#f1f5f9"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text x="50" y="30" fill="#94a3b8" fontSize="8" textAnchor="middle">
                Reactor 2 (Bypassed)
              </text>
            </g>
          )}

          {/* DISTRIBUTION HUB (DH) */}
          {isDhActive ? (
            <g transform="translate(700, 120)">
              <circle
                r="22"
                fill="#ef4444"
                stroke="#b91c1c"
                strokeWidth="2"
                className="drop-shadow-sm"
              />
              <text x="0" y="-3" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                DH Hub
              </text>
              <text x="0" y="8" fill="#fee2e2" fontSize="8" fontWeight="medium" textAnchor="middle">
                Port {hubPort || "1"}
              </text>
            </g>
          ) : (
            <g transform="translate(700, 120)">
              <circle
                r="18"
                fill="#f1f5f9"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <text x="0" y="3" fill="#94a3b8" fontSize="8" textAnchor="middle">
                No DH
              </text>
            </g>
          )}

          {/* OUTLET / COLLECTION VIAL */}
          <g transform="translate(850, 95)">
            {/* Outer border of Vial */}
            <path
              d="M 10,0 L 22,0 L 22,5 L 30,12 L 30,42 Q 30,48 20,48 Q 10,48 10,42 L 10,12 Z"
              fill="#e2e8f0"
              stroke="#64748b"
              strokeWidth="2"
            />
            {/* Liquid Level */}
            <path
              d="M 12,20 L 28,20 L 28,41 Q 28,46 20,46 Q 12,46 12,41 Z"
              fill="#93c5fd"
              opacity="0.8"
            />
            <text x="20" y="58" fill="#475569" fontSize="8" fontWeight="bold" textAnchor="middle">
              Vial Out
            </text>
          </g>

          {/* R1 PUMPS LOGIC - Aligned perfectly above Reactor 1 */}
          {(() => {
            const r1ConnectedPumps = activePumps.filter((p) => p.assignedReactor === "Reactor 1");
            const gap = 32;
            const totalWidth = (r1ConnectedPumps.length - 1) * gap;
            const startX = 250 - totalWidth / 2;

            return r1ConnectedPumps.map((pump, idx) => {
              const cx = startX + idx * gap;
              const isSweep = pump.sweep === "Yes";
              const used = usedVolumes?.[pump.id] || 0;
              const total = pump.loopVol || 1;
              const ratioLeft = Math.max(0, Math.min(1, (total - used) / total));

              return (
                <g key={pump.id}>
                  {/* Connection Line straight down into Reactor 1's top (Y: 95) */}
                  <line
                    x1={cx}
                    y1="65"
                    x2={cx}
                    y2="95"
                    stroke={isSweep ? "#a855f7" : "#10b981"}
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  {/* Loop Cylinders background */}
                  <rect
                    x={cx - 13}
                    y="30"
                    width="26"
                    height="35"
                    rx="4"
                    fill="#f1f5f9"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                  />
                  {/* Inner remaining cylinder representing volume remaining */}
                  {ratioLeft > 0 && (
                    <rect
                      x={cx - 13}
                      y={65 - 35 * ratioLeft}
                      width="26"
                      height={35 * ratioLeft}
                      rx="2"
                      fill="#10b981"
                      opacity="0.85"
                    />
                  )}
                  {/* Cap top and bottom */}
                  <ellipse cx={cx} cy="30" rx="13" ry="4" fill={ratioLeft >= 1.0 ? "#047857" : "#94a3b8"} />
                  <ellipse cx={cx} cy="65" rx="13" ry="4" fill="#047857" />
                  {/* Cylinder border */}
                  <rect
                    x={cx - 13}
                    y="30"
                    width="26"
                    height="35"
                    rx="4"
                    fill="none"
                    stroke="#047857"
                    strokeWidth="1.5"
                  />
                  <text x={cx} y="48" fill="#fff" fontSize="8" fontWeight="bold" textAnchor="middle">
                    P{pump.id}
                  </text>
                  <g className="font-mono">
                    <text x={cx} y="7" fill="#047857" fontSize="8" fontWeight="bold" textAnchor="middle">
                      {Math.max(0, pump.loopVol - used).toFixed(0)}
                    </text>
                    <line x1={cx - 10} y1="12" x2={cx + 10} y2="12" stroke="#94a3b8" strokeWidth="1" />
                    <text x={cx} y="21" fill="#475569" fontSize="8" fontWeight="bold" textAnchor="middle">
                      {pump.loopVol} µL
                    </text>
                  </g>

                  {/* If this is the sweep pump, draw its visual syringe below Reactor 1 aligned with this X axis column! */}
                  {isSweep && (
                    <g transform={`translate(${cx - 20}, 160)`}>
                      {/* Connection line from main pipeline (Y: 120) to syringe (Y: 160) */}
                      <line x1="20" y1="-40" x2="20" y2="0" stroke="#7e22ce" strokeWidth="1.5" strokeDasharray="3 2" />
                      {/* Plunger */}
                      <line x1="20" y1="0" x2="20" y2="35" stroke="#9333ea" strokeWidth="3" />
                      {/* Barrel */}
                      <rect x="12" y="5" width="16" height="25" rx="1" fill="#e9d5ff" stroke="#7e22ce" strokeWidth="1.5" />
                      {/* Plunger handle */}
                      <line x1="10" y1="35" x2="30" y2="35" stroke="#7e22ce" strokeWidth="2" />
                      <text x="20" y="47" fill="#6b21a8" fontSize="8" fontWeight="bold" textAnchor="middle">
                        P{pump.id} Sweep Syringe
                      </text>
                    </g>
                  )}
                </g>
              );
            });
          })()}

          {/* R2 PUMPS SYSTEM (Drawn below Reactor 2) */}
          {isTwoStep &&
            r2Pumps.map((pump, idx) => {
              const cx = 460 + idx * 45;
              const used = usedVolumes?.[pump.id] || 0;
              const total = pump.loopVol || 1;
              const ratioLeft = Math.max(0, Math.min(1, (total - used) / total));

              return (
                <g key={pump.id}>
                  {/* Connection Line */}
                  <line
                    x1={cx}
                    y1="145"
                    x2={cx}
                    y2="185"
                    stroke="#10b981"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  {/* Loop Cylinders background */}
                  <rect
                    x={cx - 14}
                    y="185"
                    width="28"
                    height="35"
                    rx="4"
                    fill="#f1f5f9"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                  />
                  {/* Inner remaining cylinder representing volume remaining */}
                  {ratioLeft > 0 && (
                    <rect
                      x={cx - 14}
                      y={220 - 35 * ratioLeft}
                      width="28"
                      height={35 * ratioLeft}
                      rx="2"
                      fill="#10b981"
                      opacity="0.85"
                    />
                  )}
                  {/* Caps */}
                  <ellipse cx={cx} cy="185" rx="14" ry="4" fill={ratioLeft >= 1.0 ? "#047857" : "#94a3b8"} />
                  <ellipse cx={cx} cy="220" rx="14" ry="4" fill="#047857" />
                  {/* Cylinder border outline */}
                  <rect
                    x={cx - 14}
                    y="185"
                    width="28"
                    height="35"
                    rx="4"
                    fill="none"
                    stroke="#047857"
                    strokeWidth="1.5"
                  />
                  <text x={cx} y="204" fill="#fff" fontSize="8" fontWeight="bold" textAnchor="middle">
                    P{pump.id}
                  </text>
                  <g className="font-mono">
                    <text x={cx} y="233" fill="#047857" fontSize="8" fontWeight="bold" textAnchor="middle">
                      {Math.max(0, pump.loopVol - used).toFixed(0)}
                    </text>
                    <line x1={cx - 10} y1="237" x2={cx + 10} y2="237" stroke="#94a3b8" strokeWidth="1" />
                    <text x={cx} y="246" fill="#475569" fontSize="8" fontWeight="bold" textAnchor="middle">
                      {pump.loopVol} µL
                    </text>
                  </g>
                </g>
              );
            })}
        </svg>
      </div>

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -1000;
          }
        }
      `}</style>
    </div>
  );
}
