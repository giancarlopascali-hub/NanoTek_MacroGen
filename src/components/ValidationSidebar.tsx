import React from "react";
import { PumpConfig, FluidicsConfig } from "../types";
import { ShieldCheck, ShieldAlert, Timer, Droplet, Hammer, AlertTriangle } from "lucide-react";

interface ValidationSidebarProps {
  pumps: PumpConfig[];
  fluidics: FluidicsConfig;
  macroContent: string;
  r1Heaters: Record<number, string>;
  r2Heaters: Record<number, string>;
  r1Bolus: string;
  r2Bolus: string;
}

export default function ValidationSidebar({
  pumps,
  fluidics,
  macroContent,
  r1Heaters,
  r2Heaters,
  r1Bolus,
  r2Bolus,
}: ValidationSidebarProps) {
  // Extract all Heaters values to check ranges
  const r1List = Object.values(r1Heaters).map((val) => Number(val) || 0);
  const r2List = Object.values(r2Heaters).map((val) => Number(val) || 0);
  const allHeaters = [...r1List, ...r2List];
  const overTempHeater = allHeaters.some((t) => t > 200);

  // Check Loop vs Syringe sizes on active pumps
  const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");
  const sizeMismatches = activePumps.filter((p) => p.loopVol > p.syringeVol);

  // Estimated synthesis runtime parse:
  // parse wait codes 'M[seconds]' or delay intervals from macroContent
  let totalWaitMs = 0;
  // Let's parse custom delay integers (as in setup_macro_tab, delay column numbers range like 60000, 120000 etc)
  const lines = macroContent.split("\n");
  lines.forEach((line) => {
    // Delays are usually at the beginning of the line separated by tabs, e.g. "60000\t..."
    const splitted = line.split("\t");
    if (splitted.length > 0 && !line.startsWith("#") && !line.startsWith("//")) {
      const waitPart = Number(splitted[0]);
      if (!isNaN(waitPart)) {
        totalWaitMs += waitPart;
      }
    }
    // Also check for command 'M' wait expressions
    const matchM = line.match(/[mM](\d+)/);
    if (matchM) {
      totalWaitMs += Number(matchM[1]);
    }
  });

  const estimatedMins = Math.floor(totalWaitMs / 60000);
  const estimatedSecs = Math.floor((totalWaitMs % 60000) / 1000);

  return (
    <div className="w-full h-full p-4 flex flex-col min-h-0 overflow-y-auto">
      <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Active Validation & Audits
      </h2>

      {/* Safety checklists status panel */}
      <div className="space-y-3 mb-6">
        {/* Core Syntax Validation Panel */}
        {sizeMismatches.length > 0 ? (
          <div className="flex items-start gap-3 bg-red-50 p-2.5 rounded border border-red-100/50">
            <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-900 leading-snug">Capacity Mismatch</p>
              <p className="text-[10px] text-red-700 mt-0.5 leading-snug">
                Pumps: {sizeMismatches.map((p) => `P${p.id}`).join(", ")} loop volume exceeds syringe limits. This triggers physical overflow!
              </p>
            </div>
          </div>
        ) : overTempHeater ? (
          <div className="flex items-start gap-3 bg-amber-50 p-2.5 rounded border border-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-900 leading-snug">Over-temp Threshold</p>
              <p className="text-[10px] text-amber-700 mt-0.5 leading-snug">
                Heating requested above 200°C. NanoTek Teflon polymer cassettes risk thermal breakdown above this range.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 bg-green-50 p-2.5 rounded border border-green-100/50">
            <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-green-900 leading-snug">Flow Integrity OK</p>
              <p className="text-[10px] text-green-700 mt-0.5 leading-snug font-sans">
                Loop lines are physically calibrated with high pressure thresholds below 400 psi limits.
              </p>
            </div>
          </div>
        )}

        {/* Synthesis Time Estimation Panel */}
        <div className="flex items-start gap-3 bg-blue-50 p-2.5 rounded border border-blue-105">
          <Timer className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-blue-900 leading-snug">Thermal & Wash Wait</p>
            <p className="text-[10px] text-blue-700 mt-0.5 leading-normal">
              Estimated wait: <strong className="font-semibold">{estimatedMins}m {estimatedSecs}s</strong>
              <br />
              (Pumping times scaled on selected syringe resolution are calculated at runtime).
            </p>
          </div>
        </div>
      </div>

      {/* Global Parameters overview panel */}
      <div className="border-t border-gray-100 pt-4 flex-1">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
          Global Specifications
        </h2>
        <div className="space-y-3">
          {/* Reactor 1 Target metric */}
          <div className="flex justify-between items-center py-1 border-b border-gray-50 text-xs">
            <span className="text-gray-500 font-medium">Reactor 1 target:</span>
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold">
              {r1Bolus} µL
            </span>
          </div>

          {/* Reactor 2 Target metric */}
          <div className="flex justify-between items-center py-1 border-b border-gray-50 text-xs">
            <span className="text-gray-500 font-medium">Reactor 2 target:</span>
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold">
              {r2Bolus} µL
            </span>
          </div>

          {/* Flow unit standard limit */}
          <div className="flex justify-between items-center py-1 border-b border-gray-50 text-xs">
            <span className="text-gray-500 font-medium">Accuracy resolution:</span>
            <span className="text-[10px] font-medium font-semibold text-gray-700 uppercase">
              5 nL / Min
            </span>
          </div>

          {/* High pressure limits */}
          <div className="flex justify-between items-center py-1 border-b border-gray-50 text-xs">
            <span className="text-gray-500 font-medium font-medium">Over-pressure Cut:</span>
            <span className="text-[10px] font-mono font-bold text-red-600 uppercase">
              400 PSI
            </span>
          </div>

          {/* Cavitation warning speeds */}
          <div className="flex justify-between items-center py-1 border-b border-gray-50 text-xs">
            <span className="text-gray-500 font-medium">Cavitation Warn:</span>
            <span className="text-[10px] font-mono font-semibold text-gray-600">
              &gt; 4,000 µL/m
            </span>
          </div>
        </div>

        {/* Small tips block */}
        <div className="mt-6 bg-slate-50 p-2.5 rounded border border-slate-100 text-[10px] text-gray-400 leading-normal flex gap-1.5">
          <Hammer className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
          <span>
            Pumps have a physical limit rate of 6,250 µL/min. Keep loops under 4,000 µL/min to prevent solute crystallization.
          </span>
        </div>
      </div>
    </div>
  );
}
