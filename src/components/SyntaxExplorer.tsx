import React, { useState } from "react";
import { Cpu, Plus, Settings2, Play, CornerDownRight, Binary, Zap } from "lucide-react";
import { PumpConfig } from "../types";

interface SyntaxExplorerProps {
  onInsertCommand?: (cmd: string) => void;
  onConcatCommand?: (cmdCode: string) => void;
  pumps: PumpConfig[];
  hubAddr?: string;
}

export default function SyntaxExplorer({
  onInsertCommand,
  onConcatCommand,
  pumps,
  hubAddr = "7",
}: SyntaxExplorerProps) {
  // Common delays & descriptions
  const [delay, setDelay] = useState<string>("0");
  const [description, setDescription] = useState<string>("Operational step");

  // 1. PUMP COMMAND STATE
  const [selectedPumpId, setSelectedPumpId] = useState<number>(() => {
    const activePumps = pumps.filter((p) => p.addr !== "0");
    return activePumps.length > 0 ? activePumps[0].id : 1;
  });
  const [valvePos, setValvePos] = useState<string>("8"); // Default fill (H = 8)
  const [velocityUlMin, setVelocityUlMin] = useState<string>("30.00");
  const [volumeUl, setVolumeUl] = useState<string>("20.00");
  const [actionType, setActionType] = useState<"D" | "P" | "A" | "None">("D");

  // Lookup selected pump config
  const selectedPump = pumps.find((p) => p.id === selectedPumpId) || {
    id: 1,
    addr: "1",
    syringeVol: 1000,
    steps: 48000,
  };

  // Resolve steps/counts
  const getPumpCalculatedMetrics = () => {
    const syrSize = selectedPump.syringeVol || 1000;
    const maxSteps = selectedPump.steps || 48000;

    const volSteps = Math.floor((Number(volumeUl) / syrSize) * maxSteps) || 0;
    const rateCounts = Math.floor(((Number(velocityUlMin) / 60.0) / syrSize) * maxSteps) || 0;

    // Clamp counts is standard
    const clampedRateCounts = Math.max(1, Math.min(6400, rateCounts));

    return { volSteps, rateCounts: clampedRateCounts };
  };

  const { volSteps, rateCounts } = getPumpCalculatedMetrics();

  // Generate Pump command string
  const getPumpCommandCode = () => {
    if (selectedPump.addr === "0" || !selectedPump.addr) {
      return "# Invalid Pump Address";
    }
    const valveStr = valvePos !== "None" ? `o${valvePos}` : "";
    const speedStr = rateCounts > 0 ? `V${rateCounts}` : "";
    const actionStr = actionType !== "None" ? `${actionType}${volSteps}` : "";
    return `/${selectedPump.addr}${valveStr}${speedStr}${actionStr}R`;
  };

  const handleInsertPumpLine = () => {
    if (onInsertCommand) {
      const code = getPumpCommandCode();
      if (!code.startsWith("#")) {
        onInsertCommand(`${delay}\t${code}\t${description || "Pump operation"}`);
      }
    }
  };

  // 2. OTHER CODE COMMAND STATE
  const [otherCmdType, setOtherCmdType] = useState<
    "Heater temp" | "DH port" | "Digital output" | "Analog output" | "Pause" | "R" | "Wait"
  >("Heater temp");

  // Specific arguments
  const [heaterIdx, setHeaterIdx] = useState<string>("1");
  const [tempVal, setTempVal] = useState<string>("100");
  const [dhPortVal, setDhPortVal] = useState<string>("1");
  const [digitalPin, setDigitalPin] = useState<string>("AUX1");
  const [digitalState, setDigitalState] = useState<string>("TRUE");
  const [analogVoltage, setAnalogVoltage] = useState<string>("2.5");
  const [pauseMs, setPauseMs] = useState<string>("1000");
  const [waitPrompt, setWaitPrompt] = useState<string>("Start reaction, place a new collection vial");

  // Build the "Other Command" string format
  const getOtherCommandCode = (): string => {
    switch (otherCmdType) {
      case "Heater temp":
        return `Set H${heaterIdx} at ${tempVal || "Off"}`;

      case "DH port": {
        const address = hubAddr && hubAddr !== "0" ? hubAddr : "7";
        return `/${address}o${dhPortVal}R`;
      }

      case "Digital output":
        return `${digitalPin} ${digitalState}`;

      case "Analog output":
        return `ANALOG ${analogVoltage}V`;

      case "Pause":
        return `M${pauseMs}`;

      case "Wait":
        return "Wait";

      case "R":
        return "R";

      default:
        return "";
    }
  };

  const finalOtherCmd = getOtherCommandCode();

  const handleAppendOther = () => {
    if (onInsertCommand) {
      const descLabel = otherCmdType === "Wait" 
        ? (waitPrompt || description || "Start reaction, place a new collection vial") 
        : (description || "Command helper");
      onInsertCommand(`${delay}\t${finalOtherCmd}\t${descLabel}`);
    }
  };

  const handleConcatOther = () => {
    if (onConcatCommand) {
      onConcatCommand(finalOtherCmd);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#fcfdfe] shrink-0 overflow-y-auto divide-y divide-gray-100">
      
      {/* HEADER BAR */}
      <div className="p-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <h2 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5 text-blue-400" />
          Command Assistant
        </h2>
        <p className="text-[9px] text-slate-300 mt-0.5">Build and append macros interactively</p>
      </div>

      {/* DELAY & COMMENT PANEL */}
      <div className="p-4 bg-slate-50 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">
              Line Delay (ms)
            </label>
            <input
              type="number"
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-2 py-1 font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">
              Description label
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g. Flush line"
            />
          </div>
        </div>
      </div>

      {/* 1. INTERACTIVE PUMP COMM */}
      <div className="p-4 space-y-3 text-xs leading-normal">
        <h3 className="text-[10px] font-bold text-blue-800 uppercase tracking-widest flex items-center gap-1.5 font-sans mb-1">
          <Binary className="w-3.5 h-3.5 text-blue-600" />
          Pump Command Builder
        </h3>

        {/* Pump selection */}
        <div>
          <label className="block text-[9px] text-gray-500 uppercase font-bold mb-1">
            Active Pump Select
          </label>
          <select
            value={selectedPumpId}
            onChange={(e) => setSelectedPumpId(Number(e.target.value))}
            className="w-full bg-white border border-gray-300 rounded px-1.5 py-1 text-xs"
          >
            {pumps.map((p) => {
              const isDisconnected = p.addr === "0" || p.addr.trim() === "";
              return (
                <option key={p.id} value={p.id} disabled={isDisconnected}>
                  P{p.id} {isDisconnected ? "(unassigned)" : `(Address ${p.addr} • ${p.syringeVol}µL)`}
                </option>
              );
            })}
          </select>
        </div>

        {/* Valve target and Action type */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">
              Valve Port (o)
            </label>
            <select
              value={valvePos}
              onChange={(e) => setValvePos(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-1 py-1 text-xs"
            >
              <option value="None">No turn</option>
              <option value="1">Port 1 (A/Waste)</option>
              <option value="2">Port 2 (B/Sweep)</option>
              <option value="3">Port 3 (C/React Solv)</option>
              <option value="4">Port 4 (D/Fill Load)</option>
              <option value="5">Port 5 (E/React Loop)</option>
              <option value="6">Port 6 (F/Reagent Line)</option>
              <option value="7">Port 7 (G/Plugged)</option>
              <option value="8">Port 8 (H/Solvent Fill)</option>
            </select>
          </div>

          <div>
            <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">
              Action Type
            </label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as any)}
              className="w-full bg-white border border-gray-300 rounded px-1.5 py-1 text-xs"
            >
              <option value="D">Dispense (D)</option>
              <option value="P">Aspirate (P)</option>
              <option value="A">Absolute (A)</option>
              <option value="None">None</option>
            </select>
          </div>
        </div>

        {/* Velocity in µL/min and Volume in µL inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">
              Velocity (µL/min)
            </label>
            <input
              type="number"
              step="0.01"
              value={velocityUlMin}
              onChange={(e) => setVelocityUlMin(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-1.5 py-1 font-mono text-xs"
              placeholder="30.00"
            />
          </div>

          <div>
            <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">
              Volume (µL)
            </label>
            <input
              type="number"
              step="0.01"
              disabled={actionType === "None"}
              value={volumeUl}
              onChange={(e) => setVolumeUl(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-1.5 py-1 font-mono text-xs disabled:bg-gray-100 disabled:text-gray-400"
              placeholder="20.00"
            />
          </div>
        </div>

        {/* Live Step Diagnostics showing the conversions */}
        <div className="bg-blue-50/50 border border-blue-105 rounded p-2 text-[10px] font-mono text-blue-800 leading-normal">
          <span className="font-bold text-blue-900 block mb-0.5">Step conversions:</span>
          Rate counts: <strong className="font-semibold text-blue-950">{rateCounts}</strong> c/s
          {actionType !== "None" && (
            <>
              <br />
              Action steps: <strong className="font-semibold text-blue-950">{volSteps}</strong> steps
            </>
          )}
        </div>

        {/* Pump Live command preview */}
        <div className="bg-neutral-800 text-neutral-300 rounded p-2 text-[10px] font-mono leading-relaxed select-all">
          <span className="text-gray-500 block mb-0.5">Format:</span>
          {getPumpCommandCode()}
        </div>

        <button
          onClick={handleInsertPumpLine}
          disabled={selectedPump.addr === "0"}
          className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-all text-xs flex items-center justify-center gap-1 px-2 shadow-sm disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Append Pump Command
        </button>
      </div>

      {/* 2. OTHER CODE COMMAND COMPONENT */}
      <div className="p-4 space-y-3 text-xs leading-normal">
        <h3 className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1.5 font-sans mb-1">
          <Zap className="w-3.5 h-3.5 text-emerald-600" />
          Other Code Commands
        </h3>

        {/* Dropdown Select Type */}
        <div>
          <label className="block text-[9px] text-gray-500 uppercase font-bold mb-1">
            Choose Code Class
          </label>
          <select
            value={otherCmdType}
            onChange={(e) => setOtherCmdType(e.target.value as any)}
            className="w-full bg-white border border-gray-300 rounded px-1.5 py-1 text-xs font-semibold"
          >
            <option value="Heater temp">Heater temp</option>
            <option value="DH port">DH port (Distribution Hub)</option>
            <option value="Digital output">Digital output (AUX)</option>
            <option value="Analog output">Analog output</option>
            <option value="Pause">Pause (M Delay)</option>
            <option value="Wait">Wait (Manual Prompt)</option>
            <option value="R">R (Run execution trigger)</option>
          </select>
        </div>

        {/* Conditional Argument Row depending on type */}
        <div className="bg-emerald-50/25 border border-emerald-100 p-2.5 rounded space-y-2">
          {otherCmdType === "Heater temp" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Heater Index</label>
                <select
                  value={heaterIdx}
                  onChange={(e) => setHeaterIdx(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-1 py-0.5"
                >
                  <option value="1">H1 (R1 Heater)</option>
                  <option value="2">H2 (R1 Sweep)</option>
                  <option value="3">H3 (R2 Heater)</option>
                  <option value="4">H4 (System Loop)</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Value (°C)</label>
                <input
                  type="text"
                  value={tempVal}
                  onChange={(e) => setTempVal(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-1.5 py-0.5 font-mono text-xs"
                  placeholder="e.g. 100 or Off"
                />
              </div>
            </div>
          )}

          {otherCmdType === "DH port" && (
            <div>
              <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">
                DH Port Index (1 - 8)
              </label>
              <select
                value={dhPortVal}
                onChange={(e) => setDhPortVal(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded px-1 py-1 text-xs font-mono"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((port) => (
                  <option key={port} value={port}>
                    o{port} (Port {port})
                  </option>
                ))}
              </select>
              <span className="text-[8px] text-slate-400 block mt-0.5 font-mono">
                DH address lookup: {hubAddr && hubAddr !== "0" ? hubAddr : "7"}
              </span>
            </div>
          )}

          {otherCmdType === "Digital output" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">AUX Trigger Port</label>
                <select
                  value={digitalPin}
                  onChange={(e) => setDigitalPin(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-1 py-0.5"
                >
                  <option value="AUX1">AUX 1</option>
                  <option value="AUX2">AUX 2</option>
                  <option value="AUX3">AUX 3</option>
                  <option value="AUX4">AUX 4</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">Logical State</label>
                <select
                  value={digitalState}
                  onChange={(e) => setDigitalState(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-1 py-0.5"
                >
                  <option value="TRUE">TRUE (ON)</option>
                  <option value="FALSE">FALSE (OFF)</option>
                </select>
              </div>
            </div>
          )}

          {otherCmdType === "Analog output" && (
            <div>
              <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">
                Voltage Level (0 - 5 V)
              </label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={analogVoltage}
                onChange={(e) => setAnalogVoltage(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded px-1.5 py-0.5 font-mono text-xs"
              />
            </div>
          )}

           {otherCmdType === "Pause" && (
            <div>
              <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">
                Pause Duration (ms)
              </label>
              <input
                type="number"
                value={pauseMs}
                onChange={(e) => setPauseMs(e.target.value)}
                placeholder="1000"
                className="w-full bg-white border border-gray-300 rounded px-1.5 py-0.5 font-mono text-xs"
              />
            </div>
          )}

          {otherCmdType === "Wait" && (
            <div>
              <label className="block text-[9px] text-gray-500 uppercase font-bold mb-0.5">
                Wait Prompt Message
              </label>
              <input
                type="text"
                value={waitPrompt}
                onChange={(e) => setWaitPrompt(e.target.value)}
                placeholder="Start reaction, place a new collection vial"
                className="w-full bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs font-medium"
              />
            </div>
          )}

          {otherCmdType === "R" && (
            <p className="text-[10px] text-slate-500 italic py-1 leading-normal">
              No arguments required for standard Execute Run trigger suffix command.
            </p>
          )}
        </div>

        {/* Custom delay and description dedicated fields for other commands section */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[9px] text-emerald-805 font-bold uppercase tracking-wider mb-0.5">
              Delay for this line (ms)
            </label>
            <input
              type="number"
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-1.5 py-0.5 font-mono text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-[9px] text-emerald-805 font-bold uppercase tracking-wider mb-0.5">
              Description label
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              placeholder="e.g. Flush Line"
            />
          </div>
        </div>

        {/* Live output preview code box */}
        <div className="bg-neutral-800 text-emerald-300 rounded p-2 text-[10px] font-mono leading-relaxed select-all">
          <span className="text-gray-500 block mb-0.5">Built code preview:</span>
          {finalOtherCmd}
        </div>

        {/* Append or Concatenate buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleAppendOther}
            className="py-1.5 border border-emerald-600 hover:bg-emerald-50 text-emerald-800 rounded font-bold transition-all text-[11px] flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            Append Line
          </button>
          <button
            onClick={handleConcatOther}
            className="py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold transition-all text-[11px] flex items-center justify-center gap-1 shadow-sm"
          >
            <CornerDownRight className="w-3.5 h-3.5" />
            Concatenate
          </button>
        </div>
      </div>

    </div>
  );
}
