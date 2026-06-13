import React from "react";
import { PumpConfig, FluidicsConfig } from "../types";
import { Settings, RefreshCw, Layers, ShieldCheck, Info } from "lucide-react";

interface PumpConfiguratorProps {
  pumps: PumpConfig[];
  onChangePump: (id: number, field: keyof PumpConfig, value: any) => void;
  fluidics: FluidicsConfig;
  onChangeFluidics: (field: keyof FluidicsConfig, value: number) => void;
  hubAddr: string;
  setHubAddr: (val: string) => void;
}

export default function PumpConfigurator({
  pumps,
  onChangePump,
  fluidics,
  onChangeFluidics,
  hubAddr,
  setHubAddr,
}: PumpConfiguratorProps) {
  return (
    <div className="space-y-6">
      {/* Dynamic Pumps Table Card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
              High-Pressure Reagent Pumps (P1 - P4)
            </h2>
          </div>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono">
            48,000 Step Resolution
          </span>
        </div>

        <div className="divide-y divide-gray-100 p-2">
          {pumps.map((pump) => {
            const isActive = pump.addr !== "0" && pump.addr.trim() !== "";
            return (
              <div
                key={pump.id}
                className={`p-4 flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between rounded-lg transition-colors ${
                  isActive ? "bg-white hover:bg-slate-50/40" : "bg-gray-50/50 opacity-70"
                }`}
              >
                {/* ID and Address Configuration */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs ${
                      isActive
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-gray-200 text-gray-400"
                    }`}
                  >
                    P{pump.id}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-gray-700">Addr:</label>
                      <input
                        type="text"
                        value={pump.addr}
                        onChange={(e) => onChangePump(pump.id, "addr", e.target.value)}
                        className="w-12 bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 mt-0.5 block">
                      {isActive ? `Pump online at address ${pump.addr}` : "Pump disabled (0)"}
                    </span>
                  </div>
                </div>

                {/* Syringe Configuration & Step Calibration */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 max-w-3xl ml-0 lg:ml-6">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                      Syringe Size
                    </label>
                    <select
                      value={pump.syringeVol}
                      disabled={!isActive}
                      onChange={(e) => onChangePump(pump.id, "syringeVol", Number(e.target.value))}
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value={250}>250 µL</option>
                      <option value={500}>500 µL</option>
                      <option value={1000}>1000 µL</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                      Step Resolution
                    </label>
                    <input
                      type="number"
                      value={pump.steps}
                      disabled={!isActive}
                      onChange={(e) => onChangePump(pump.id, "steps", Number(e.target.value))}
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                      Loop Vol (µL)
                    </label>
                    <input
                      type="number"
                      value={pump.loopVol}
                      disabled={!isActive}
                      onChange={(e) => onChangePump(pump.id, "loopVol", Number(e.target.value))}
                      className={`w-full bg-white border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 ${
                        pump.loopVol > pump.syringeVol ? "border-red-500 text-red-700 bg-red-50" : "border-gray-300"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                      Target reactor
                    </label>
                    <select
                      value={pump.assignedReactor}
                      disabled={!isActive}
                      onChange={(e) =>
                        onChangePump(pump.id, "assignedReactor", e.target.value as any)
                      }
                      className="w-full bg-white border border-gray-300 rounded px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="Reactor 1">Reactor 1</option>
                      <option value="Reactor 2">Reactor 2</option>
                    </select>
                  </div>
                </div>

                {/* Sweep designation (Only applicable to Reactor 1) */}
                <div className="flex items-center gap-2 mt-2 lg:mt-0">
                  <label className="text-xs font-medium text-gray-500">Is Sweep?</label>
                  {(() => {
                    const isSweepTakenByOther = pumps.some((p) => p.sweep === "Yes" && p.id !== pump.id);
                    return (
                      <select
                        value={pump.sweep}
                        disabled={!isActive || pump.assignedReactor === "Reactor 2" || isSweepTakenByOther}
                        onChange={(e) => onChangePump(pump.id, "sweep", e.target.value as any)}
                        className={`bg-white border border-gray-300 rounded px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 ${
                          isSweepTakenByOther ? "opacity-60 bg-gray-50" : ""
                        }`}
                      >
                        <option value="No">No</option>
                        <option value="Yes" disabled={isSweepTakenByOther}>
                          {isSweepTakenByOther ? "Yes (Limit 1)" : "Yes"}
                        </option>
                      </select>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Distribution Hub & Plumbing Volumes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Valve Hub and Distribution properties */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-purple-600" />
              Distribution Hub (DH) configuration
            </h3>
            <p className="text-[11px] text-gray-400">
              Set Address to non-zero status to install the multi-stage auxiliary selection hub.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-700">DH Address:</label>
              <input
                type="text"
                value={hubAddr}
                onChange={(e) => setHubAddr(e.target.value)}
                className="w-14 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="7"
              />
            </div>
            <div className="h-6 w-px bg-slate-200"></div>
            <span className="text-xs font-medium text-gray-600">
              {Number(hubAddr) > 0 ? "DH Device Installed " : "DH bypassed"}
            </span>
          </div>
        </div>

        {/* Tubing Dimensions & calibrated volume */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Calibrated Fluidics (µL)
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[10px] text-gray-500 font-medium mb-1">Reactor 1 Volume</label>
              <input
                type="number"
                value={fluidics.reactor1Vol}
                onChange={(e) => onChangeFluidics("reactor1Vol", Number(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 font-medium mb-1 font-sans">Reactor 2 Volume</label>
              <input
                type="number"
                value={fluidics.reactor2Vol}
                onChange={(e) => onChangeFluidics("reactor2Vol", Number(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 font-medium mb-1">Transfer 1 Volume</label>
              <input
                type="number"
                value={fluidics.transfer1Vol}
                onChange={(e) => onChangeFluidics("transfer1Vol", Number(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 font-medium mb-1">Transfer 2 Volume</label>
              <input
                type="number"
                value={fluidics.transfer2Vol}
                onChange={(e) => onChangeFluidics("transfer2Vol", Number(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-gray-500 font-medium mb-1">Sweep Tubing Volume</label>
              <input
                type="number"
                value={fluidics.sweepVol}
                onChange={(e) => onChangeFluidics("sweepVol", Number(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Physics / Viscosity warning */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-3 text-xs text-blue-900 leading-relaxed shadow-sm">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block mb-0.5">Physical Solution Advice:</span>
          It is highly recommended that tubing inner diameters stay accurately calibrated to guarantee proper volumetric timing.
          Standard NanoTek Teflon sleeves support 0.020&quot; ID (representing ~400 µL line thresholds), ensuring consistent laminar flow is maintained without exceeding internal 400 psi safety pressure locks.
        </div>
      </div>
    </div>
  );
}
