import React from "react";
import { PumpConfig, FluidicsConfig, AUXState } from "../types";
import { Thermometer, ShieldAlert, CheckCircle, Flame, Layers, Award, Play } from "lucide-react";

interface ReactionControlProps {
  pumps: PumpConfig[];
  fluidics: FluidicsConfig;
  reactionData: Record<string, Record<number, { vol: string; fr: string }>>;
  onChangeField: (rid: "R1" | "R2", pid: number, field: "vol" | "fr", value: string) => void;
  r1Heaters: Record<number, string>;
  setR1Heaters: (id: number, val: string) => void;
  r2Heaters: Record<number, string>;
  setR2Heaters: (id: number, val: string) => void;
  hubPort: string;
  setHubPort: (val: string) => void;
  finalSweepFr: string;
  setFinalSweepFr: (val: string) => void;
  autoSample: "Yes" | "No";
  setAutoSample: (val: "Yes" | "No") => void;
  auxA: string;
  setAuxA: (val: string) => void;
  auxB: string;
  setAuxB: (val: string) => void;
  asLogic: Record<string, AUXState>;
  onChangeAuxLogic: (actionKey: string, field: "label" | "A" | "B", val: string) => void;
  onBuildMacro: () => void;
  r1Bolus: string;
  r1FrSum: string;
  r1Res: string;
  r2Bolus: string;
  r2FrSum: string;
  r2Res: string;
  checkSafety: () => { safe: boolean; msg: string } | null;
  hubAddr: string;
}

export default function ReactionControl({
  pumps,
  fluidics,
  reactionData,
  onChangeField,
  r1Heaters,
  setR1Heaters,
  r2Heaters,
  setR2Heaters,
  hubPort,
  setHubPort,
  finalSweepFr,
  setFinalSweepFr,
  autoSample,
  setAutoSample,
  auxA,
  setAuxA,
  auxB,
  setAuxB,
  asLogic,
  onChangeAuxLogic,
  onBuildMacro,
  r1Bolus,
  r1FrSum,
  r1Res,
  r2Bolus,
  r2FrSum,
  r2Res,
  checkSafety,
  hubAddr,
}: ReactionControlProps) {
  const [safetyStatus, setSafetyStatus] = React.useState<{ safe: boolean; msg: string } | null>(null);

  const isTwoStep = fluidics.reactor2Vol > 0;

  const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");
  const r1Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 1");
  const r2Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 2" || p.sweep === "Yes");

  const runSafetyAudit = () => {
    const res = checkSafety();
    setSafetyStatus(res);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* REACTION 1 CONTAINER */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          {/* Header & Metrics */}
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              Reaction Stage 1 (Reactor 1)
            </h3>
            <div className="flex gap-3 text-xs">
              <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-mono">
                Bolus: <strong className="text-gray-900">{r1Bolus}</strong> µL
              </span>
              <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-mono">
                Flow Rate: <strong className="text-gray-900">{r1FrSum}</strong> µL/m
              </span>
              <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded font-mono border border-emerald-100">
                RES: <strong className="text-emerald-950">{r1Res}</strong>
              </span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* R1 Heaters assignments */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Heaters (°C):
              </span>
              {[1, 2, 3, 4].map((id) => {
                const thermalAssignedInR2 = r2Heaters[id] && r2Heaters[id].trim() !== "";
                return (
                  <div key={id} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="font-semibold text-gray-500">H{id}:</span>
                    <input
                      type="text"
                      disabled={thermalAssignedInR2}
                      value={r1Heaters[id] || ""}
                      onChange={(e) => setR1Heaters(id, e.target.value)}
                      placeholder={thermalAssignedInR2 ? "R2" : "Off"}
                      className="w-12 bg-white border border-gray-300 rounded px-1.5 py-0.5 font-mono text-center text-xs focus:ring-1 focus:ring-blue-500 disabled:bg-gray-150 disabled:text-gray-400"
                    />
                  </div>
                );
              })}
            </div>

            {/* List pumps assigned to Reactor 1 */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                Assigned Reactants
              </span>
              {r1Pumps.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  No reagent pumps currently targeting Reactor 1. Connect a pump in System configuration.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {r1Pumps.map((pump) => {
                    const rowData = reactionData["R1"]?.[pump.id] || { vol: "0.00", fr: "0.00" };
                    const isSw = pump.sweep === "Yes" && isTwoStep;
                    return (
                      <div
                        key={pump.id}
                        className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                          isSw ? "bg-purple-50/20 border-purple-200/50" : "border-slate-100 hover:border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`w-5 h-5 rounded font-semibold flex items-center justify-center font-mono ${
                            isSw ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
                          }`}>
                            P{pump.id}
                          </span>
                          <span className="text-xs text-gray-600">
                            {isSw ? (
                              <span className="font-semibold text-purple-700">Sweep as Reactant (Loop: {pump.loopVol} µL)</span>
                            ) : (
                              `Reactant (Loop: ${pump.loopVol} µL)`
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase font-bold text-gray-400">Volume:</span>
                            <div className="relative">
                              <input
                                type="text"
                                value={rowData.vol}
                                onChange={(e) => onChangeField("R1", pump.id, "vol", e.target.value)}
                                className="w-16 border border-gray-300 rounded px-1 py-0.5 text-xs font-mono text-center focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="absolute right-1 top-0.5 text-[8px] text-gray-400 font-mono">µL</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase font-bold text-gray-400">Rate:</span>
                            <div className="relative">
                              <input
                                type="text"
                                value={rowData.fr}
                                onChange={(e) => onChangeField("R1", pump.id, "fr", e.target.value)}
                                className="w-20 border border-gray-300 rounded px-1 py-0.5 text-xs font-mono text-center focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="absolute right-1 top-0.5 text-[8px] text-gray-400 font-mono">µL/m</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* REACTION 2 CONTAINER */}
        <div className={`border rounded-lg shadow-sm transition-all duration-300 ${
          isTwoStep 
            ? "bg-white border-gray-200" 
            : "bg-gray-55/65 border-gray-300 opacity-60 pointer-events-none"
        }`}>
          {/* Header & Metrics */}
          <div className={`p-4 border-b flex flex-wrap justify-between items-center gap-2 rounded-t-lg ${
            isTwoStep ? "border-gray-100 bg-gray-50/50" : "border-gray-250 bg-gray-200/50"
          }`}>
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isTwoStep ? "bg-blue-600 animate-pulse" : "bg-gray-400"}`}></span>
              Reaction Stage 2 + Sweep (Reactor 2)
            </h3>
            {isTwoStep ? (
              <div className="flex gap-3 text-xs">
                <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-mono">
                  Total: <strong className="text-gray-900">{r2Bolus}</strong> µL
                </span>
                <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-mono">
                  Flow Rate: <strong className="text-gray-900">{r2FrSum}</strong> µL/m
                </span>
                <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded font-mono border border-emerald-100">
                  RES: <strong className="text-emerald-950">{r2Res}</strong>
                </span>
              </div>
            ) : (
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 uppercase tracking-wider">
                1-Step Mode (Deactivated)
              </span>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Warning Banner inside the container when R2 is bypassed */}
            {!isTwoStep && (
              <div className="bg-slate-100 border border-slate-200 rounded p-2.5 text-[11px] text-slate-600 leading-normal">
                <p className="font-semibold text-slate-800 mb-0.5">Reactor 2 Bypassed</p>
                R2 internal volume is <strong>0 µL</strong> in the System config. Stage 2 reagents, sweep lines, and heaters are inactive.
              </div>
            )}

            {/* Heaters Sync */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Heaters (°C):
              </span>
              {[1, 2, 3, 4].map((id) => {
                const thermalAssignedInR1 = r1Heaters[id] && r1Heaters[id].trim() !== "";
                return (
                  <div key={id} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="font-semibold text-gray-500">H{id}:</span>
                    <input
                      type="text"
                      disabled={thermalAssignedInR1 || !isTwoStep}
                      value={isTwoStep ? (r2Heaters[id] || "") : ""}
                      onChange={(e) => setR2Heaters(id, e.target.value)}
                      placeholder={!isTwoStep ? "N/A" : (thermalAssignedInR1 ? "R1" : "Off")}
                      className="w-12 bg-white border border-gray-300 rounded px-1.5 py-0.5 font-mono text-center text-xs focus:ring-1 focus:ring-blue-500 disabled:bg-gray-150 disabled:text-gray-400"
                    />
                  </div>
                );
              })}
            </div>

            {/* List pumps in R2 */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                Reactants & Sweep Channels
              </span>
              {r2Pumps.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  No reagent or sweep pumps assigned to React 2. Maintain a pump in system config.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {r2Pumps.map((pump) => {
                    const isSw = pump.sweep === "Yes";
                    const rowData = reactionData["R2"]?.[pump.id] || { vol: "0.00", fr: "0.00" };
                    return (
                      <div
                        key={pump.id}
                        className={`flex items-center justify-between p-3 border border-slate-100 hover:border-slate-200 bg-white rounded-lg transition-colors ${
                          isSw ? "bg-purple-50/20 border-purple-100/50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`w-5 h-5 rounded font-semibold flex items-center justify-center font-mono ${
                              isSw ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            P{pump.id}
                          </span>
                          <span className="text-xs text-gray-600 font-semibold uppercase tracking-wider text-[9px]">
                            {isSw ? "Sweep Channel" : `Reactant (Loop ${pump.loopVol}µL)`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase font-bold text-gray-400">Volume:</span>
                            <div className="relative">
                              <input
                                type="text"
                                disabled={!isTwoStep}
                                readOnly={isSw || !isTwoStep}
                                value={isTwoStep ? rowData.vol : "0.00"}
                                onChange={(e) => onChangeField("R2", pump.id, "vol", e.target.value)}
                                className={`w-16 border rounded px-1 py-0.5 text-xs font-mono text-center focus:outline-none ${
                                  !isTwoStep 
                                    ? "bg-gray-100 text-gray-400 border-gray-200"
                                    : isSw 
                                      ? "bg-purple-50 text-purple-900 border-purple-200 font-bold" 
                                      : "border-gray-300 focus:ring-1 focus:ring-blue-500 bg-white"
                                }`}
                              />
                              <span className="absolute right-1 top-0.5 text-[8px] text-gray-400 font-mono">µL</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase font-bold text-gray-400">Rate:</span>
                            <div className="relative">
                              <input
                                type="text"
                                disabled={!isTwoStep}
                                value={isTwoStep ? rowData.fr : "0.00"}
                                onChange={(e) => onChangeField("R2", pump.id, "fr", e.target.value)}
                                className={`w-20 border rounded px-1 py-0.5 text-xs font-mono text-center focus:ring-1 focus:ring-blue-500 ${
                                  !isTwoStep ? "bg-gray-100 text-gray-400 border-gray-200" : "border-gray-300 bg-white"
                                }`}
                              />
                              <span className="absolute right-1 top-0.5 text-[8px] text-gray-400 font-mono">µL/m</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* GLOBAL AND AUTOSAMPLING SECTION */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-5">
        <div className="border-b border-gray-100 pb-3 flex justify-between items-center flex-wrap gap-3">
          <div>
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              Global Settings & Fraction Collecting Matrix
            </h3>
            <p className="text-[11px] text-gray-400">
              Configure auxiliary sample valves, trigger ports, and sweeps prior to compiling block text.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={runSafetyAudit}
              className="px-3.5 py-1.5 text-xs font-semibold bg-white border border-gray-300 hover:bg-gray-50 rounded"
            >
              Verify Safety Audit
            </button>
            <button
              onClick={onBuildMacro}
              className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded shadow-sm flex items-center gap-1.5"
            >
              <Play className="w-3 h-3 fill-white" />
              Build Macro Block
            </button>
          </div>
        </div>

        {/* Safety Status Notification */}
        {safetyStatus && (
          <div
            className={`p-3 rounded-lg border text-xs flex gap-3 items-start leading-relaxed animate-fade-in ${
              safetyStatus.safe
                ? "bg-green-50 border-green-200 text-green-900"
                : "bg-red-50 border-red-200 text-red-950"
            }`}
          >
            <ShieldAlert className={`w-4 h-4 shrink-0 mt-0.5 ${safetyStatus.safe ? "text-green-500" : "text-red-500"}`} />
            <div>
              <strong className="block font-bold mb-0.5">
                {safetyStatus.safe ? "Audit Cleared Successfully" : "Plumbing Safety Alert!"}
              </strong>
              {safetyStatus.msg}
            </div>
          </div>
        )}

        {/* Configurations input row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
              Active Hub Port {(!hubAddr || hubAddr === "0" || hubAddr.trim() === "") && (
                <span className="text-amber-600 font-medium text-[8px] tracking-normal uppercase ml-1">(Bypassed)</span>
              )}
            </label>
            <input
              type="text"
              disabled={!hubAddr || hubAddr === "0" || hubAddr.trim() === ""}
              value={(!hubAddr || hubAddr === "0" || hubAddr.trim() === "") ? "Disabled (Addr 0)" : hubPort}
              onChange={(e) => setHubPort(e.target.value)}
              className={`w-full border rounded px-2.5 py-1.5 font-mono focus:ring-1 focus:ring-blue-500 ${
                (!hubAddr || hubAddr === "0" || hubAddr.trim() === "")
                  ? "bg-slate-100 border-slate-205 text-slate-400 cursor-not-allowed"
                  : "bg-white border-gray-300"
              }`}
              placeholder="1"
            />
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
              Sweep Delivery Rate (µL/min)
            </label>
            <input
              type="text"
              value={finalSweepFr}
              onChange={(e) => setFinalSweepFr(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 font-mono focus:ring-1"
            />
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
              Enable Auto Sampling?
            </label>
            <select
              value={autoSample}
              onChange={(e) => setAutoSample(e.target.value as any)}
              className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 font-medium focus:ring-1"
            >
              <option value="No">No (Manual vial collection)</option>
              <option value="Yes">Yes (Matrix auxiliary valves)</option>
            </select>
          </div>
        </div>

        {/* Auto sampling settings sub panel */}
        {autoSample === "Yes" && (
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-4 animate-slide-up">
            <div className="flex gap-4 items-center">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Port Channels:
              </span>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-gray-500">AUX A ID:</span>
                <input
                  type="text"
                  value={auxA}
                  onChange={(e) => setAuxA(e.target.value)}
                  className="w-10 bg-white border border-gray-300 rounded text-center px-1 py-0.5 font-mono"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-gray-500">AUX B ID:</span>
                <input
                  type="text"
                  value={auxB}
                  onChange={(e) => setAuxB(e.target.value)}
                  className="w-10 bg-white border border-gray-300 rounded text-center px-1 py-0.5 font-mono"
                />
              </div>
            </div>

            {/* Matrix logic config grid */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-xs bg-white rounded border border-gray-200 divide-y divide-gray-200">
                <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">System Action</th>
                    <th className="px-3 py-2 text-center">AUX {auxA || "?"} state</th>
                    <th className="px-3 py-2 text-center">AUX {auxB || "?"} state</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                  {Object.entries(asLogic).map(([key, item]) => {
                    const isCustom = key === "Custom";
                    return (
                      <tr key={key}>
                        <td className="px-3 py-2">
                          {isCustom ? (
                            <input
                              type="text"
                              value={item.label}
                              onChange={(e) => onChangeAuxLogic(key, "label", e.target.value)}
                              className="bg-slate-50 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-800 shrink-0 font-medium"
                            />
                          ) : (
                            <span className="font-semibold">{key}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <select
                            value={item.A}
                            onChange={(e) => onChangeAuxLogic(key, "A", e.target.value)}
                            className="bg-white border border-gray-200 rounded text-xs px-1.5 py-0.5"
                          >
                            <option value="OFF">OFF</option>
                            <option value="ON">ON</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <select
                            value={item.B}
                            onChange={(e) => onChangeAuxLogic(key, "B", e.target.value)}
                            className="bg-white border border-gray-200 rounded text-xs px-1.5 py-0.5"
                          >
                            <option value="OFF">OFF</option>
                            <option value="ON">ON</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
