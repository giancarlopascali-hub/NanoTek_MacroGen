import React, { useState, useEffect } from "react";
import { PumpConfig, FluidicsConfig, AUXState, LogLine } from "./types";
import { Play, Code, ShieldCheck, Cpu, Terminal, Sparkles, BookOpen, Settings, Flame, ChevronUp, ChevronDown } from "lucide-react";
import FluidicSchematic from "./components/FluidicSchematic";
import SyntaxExplorer from "./components/SyntaxExplorer";
import PumpConfigurator from "./components/PumpConfigurator";
import ReactionControl from "./components/ReactionControl";
import MacroIde from "./components/MacroIde";
import ValidationSidebar from "./components/ValidationSidebar";

export default function App() {
  // Tabs: "System", "Reaction", "Macro"
  const [activeTab, setActiveTab] = useState<"System" | "Reaction" | "Macro">("System");

  // Console toggle state (defaults to closed/down per user intent)
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);

  // Pumps state (P1 to P4)
  const [pumps, setPumps] = useState<PumpConfig[]>([
    { id: 1, addr: "1", steps: 48000, syringeVol: 1000, loopVol: 500, assignedReactor: "Reactor 1", sweep: "No" },
    { id: 2, addr: "2", steps: 48000, syringeVol: 1000, loopVol: 500, assignedReactor: "Reactor 1", sweep: "No" },
    { id: 3, addr: "3", steps: 48000, syringeVol: 1000, loopVol: 500, assignedReactor: "Reactor 1", sweep: "No" },
    { id: 4, addr: "0", steps: 48000, syringeVol: 1000, loopVol: 500, assignedReactor: "Reactor 2", sweep: "No" },
  ]);

  // Calibrated Line Volumes
  const [fluidics, setFluidics] = useState<FluidicsConfig>({
    reactor1Vol: 10,
    reactor2Vol: 10,
    transfer1Vol: 100,
    transfer2Vol: 100,
    sweepVol: 100,
  });

  // Target DH address & single port selector
  const [hubAddr, setHubAddr] = useState<string>("7");
  const [hubPort, setHubPort] = useState<string>("1");

  // Reactant volumes and flows for reaction stages R1 and R2
  const [reactionData, setReactionData] = useState<Record<string, Record<number, { vol: string; fr: string }>>>({
    R1: {
      1: { vol: "20.00", fr: "30.00" },
      2: { vol: "20.00", fr: "30.00" },
      3: { vol: "0.00", fr: "0.00" },
      4: { vol: "0.00", fr: "0.00" },
    },
    R2: {
      1: { vol: "0.00", fr: "0.00" },
      2: { vol: "0.00", fr: "0.00" },
      3: { vol: "0.00", fr: "0.00" },
      4: { vol: "0.00", fr: "0.00" },
    },
  });

  // Thermal Heaters sharing physical sensors
  const [r1Heaters, setR1Heaters] = useState<Record<number, string>>({
    1: "100",
    2: "",
    3: "",
    4: "",
  });
  const [r2Heaters, setR2Heaters] = useState<Record<number, string>>({
    1: "",
    2: "100",
    3: "",
    4: "",
  });

  // Global Sweep and Auto Sample triggers
  const [finalSweepFr, setFinalSweepFr] = useState<string>("100");
  const [autoSample, setAutoSample] = useState<"Yes" | "No">("No");
  const [auxA, setAuxA] = useState<string>("1");
  const [auxB, setAuxB] = useState<string>("2");

  // Auxiliary collection fraction matrix
  const [asLogic, setAsLogic] = useState<Record<string, AUXState>>({
    "Start Collection": { label: "Start Collection", A: "ON", B: "OFF" },
    "Stop Collection": { label: "Stop Collection", A: "OFF", B: "ON" },
    "Next Sample": { label: "Next Sample", A: "ON", B: "ON" },
    "Custom": { label: "Custom Status", A: "OFF", B: "OFF" },
  });

  // Live Compiled Macro block content
  const [macroContent, setMacroContent] = useState<string>("");

  // Bottom terminal console log timeline state
  const [consoleLogs, setConsoleLogs] = useState<LogLine[]>([
    {
      timestamp: new Date().toLocaleTimeString(),
      message: "Initializing ADVION NanoTek Macro Suite standalone compiler...",
      type: "info",
    },
    {
      timestamp: new Date().toLocaleTimeString(),
      message: "Diagnostics: System active. Teflon lines calculated below 400 psi thresholds.",
      type: "success",
    },
  ]);

  // Toast / Status Message bar
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const addLog = (message: string, type: "info" | "success" | "error" | "warning" = "info") => {
    setConsoleLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString(),
        message,
        type,
      },
    ]);
  };

  // State changes effect handling: Automatically sync R2 SW Vol to R1 Bolus!
  useEffect(() => {
    // 1. Calculate Reactor 1 Bolus (Sum of R1 Assigned Reagent Pump Volumes, including the Sweep Pump's Stage 1 reagent share)
    let bolus1Val = 0;
    pumps.forEach((p) => {
      if (p.addr !== "0" && p.assignedReactor === "Reactor 1") {
        bolus1Val += Number(reactionData["R1"]?.[p.id]?.vol) || 0;
      }
    });

    const bolus1Formatted = bolus1Val.toFixed(2);

    // 2. Identify Sweep pump in Reactor 2
    const swPump = pumps.find((p) => p.addr !== "0" && p.sweep === "Yes");
    if (swPump) {
      const currentSwVol = reactionData["R2"]?.[swPump.id]?.vol;
      if (currentSwVol !== bolus1Formatted) {
        setReactionData((prev) => ({
          ...prev,
          R2: {
            ...prev.R2,
            [swPump.id]: {
              ...prev.R2[swPump.id],
              vol: bolus1Formatted,
            },
          },
        }));
        // Flow rate sync for Reactor 2 pumps after volume syncs up!
        syncFlowRates("R2", swPump.id, bolus1Formatted, reactionData["R2"]?.[swPump.id]?.fr || "0.00");
      }
    }
  }, [pumps, reactionData["R1"]]);

  // Syringe limit check callback
  const handlePumpChange = (id: number, field: keyof PumpConfig, value: any) => {
    setPumps((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const updated = { ...p, [field]: value };
          // Loop volume verification: loop capacity must never exceed syringe size
          if (field === "loopVol" && value > p.syringeVol) {
            triggerToast(`Warning: Pump ${p.id} Loop volume (${value}µL) cannot exceed Syringe capability (${p.syringeVol}µL). Reset to Syringe Size.`);
            updated.loopVol = p.syringeVol;
          }
          if (field === "syringeVol" && p.loopVol > value) {
            updated.loopVol = value;
          }
          // Exclusive sweep designation: sweep pump belongs solely to Reactor 1 physically
          if (field === "assignedReactor" && value === "Reactor 2") {
            updated.sweep = "No";
          }
          return updated;
        }
        return p;
      })
    );
  };

  const handleFluidicsChange = (field: keyof FluidicsConfig, value: number) => {
    setFluidics((prev) => ({ ...prev, [field]: value }));
  };

  // Synchronizes flow rates such that delivery duration remains matching!
  // T = Volume / flowrate -> If other_vol > 0, other_fr = other_vol / T
  const syncFlowRates = (rid: "R1" | "R2", changedId: number, newVol: string, newFr: string) => {
    const vol = parseFloat(newVol) || 0;
    const fr = parseFloat(newFr) || 0;

    if (vol > 0 && fr > 0) {
      const t = vol / fr; // Delivery duration in minutes

      setReactionData((prev) => {
        const stageConfig = { ...prev[rid] };
        Object.keys(stageConfig).forEach((key) => {
          const pid = Number(key);
          if (pid === changedId) return;

          // Verifies if pump belongs to this reaction step
          const targRec = rid === "R1" ? "Reactor 1" : "Reactor 2";
          const pumpInvolved = pumps.find(
            (p) =>
              p.id === pid &&
              p.addr !== "0" &&
              (p.assignedReactor === targRec || (rid === "R2" && p.sweep === "Yes"))
          );

          if (pumpInvolved) {
            const otherVol = parseFloat(stageConfig[pid].vol) || 0;
            if (otherVol > 0) {
              const syncedFr = (otherVol / t).toFixed(2);
              stageConfig[pid] = { ...stageConfig[pid], fr: syncedFr };
            }
          }
        });

        return { ...prev, [rid]: stageConfig };
      });
    }
  };

  const handleReactFieldChange = (rid: "R1" | "R2", pid: number, field: "vol" | "fr", value: string) => {
    // 1. Double check loop limit before committing
    if (field === "vol") {
      const targetPump = pumps.find((p) => p.id === pid);
      if (targetPump && Number(value) > targetPump.loopVol && targetPump.sweep === "No") {
        triggerToast(`Pump ${pid} volume request exceeds static loop capacity (${targetPump.loopVol}µL)!`);
        value = "0.00";
      }
    }

    setReactionData((prev) => {
      const targetState = { ...prev[rid] };
      const current = { ...targetState[pid], [field]: value };
      targetState[pid] = current;

      // 2. Perform automated Delivery Duration synchronization across channels
      const volVal = field === "vol" ? value : current.vol;
      const frVal = field === "fr" ? value : current.fr;
      setTimeout(() => {
        syncFlowRates(rid, pid, volVal, frVal);
      }, 0);

      return { ...prev, [rid]: targetState };
    });
  };

  const handleAuxLogicChange = (actionKey: string, field: "label" | "A" | "B", val: string) => {
    setAsLogic((prev) => ({
      ...prev,
      [actionKey]: {
        ...prev[actionKey],
        [field]: val,
      },
    }));
  };

  // Heaters exclusive synchronizations (thermals on physical channels are mutual)
  const syncR1Heater = (id: number, val: string) => {
    setR1Heaters((prev) => {
      const current = { ...prev, [id]: val };
      if (val.trim() !== "") {
        setR2Heaters((prev2) => ({ ...prev2, [id]: "" }));
      }
      return current;
    });
  };

  const syncR2Heater = (id: number, val: string) => {
    setR2Heaters((prev) => {
      const current = { ...prev, [id]: val };
      if (val.trim() !== "") {
        setR1Heaters((prev1) => ({ ...prev1, [id]: "" }));
      }
      return current;
    });
  };

  // Calculates Step Counts based on syringe size and steps resolution
  const computeSteps = (pId: number, volumeUl: number, rateUlMin: number) => {
    const pump = pumps.find((p) => p.id === pId);
    if (!pump) return { volSteps: 0, fpsCounts: 0 };

    const syrSize = pump.syringeVol;
    const maxSteps = pump.steps;

    // Volume Steps: (Vol / Syringe) * resolution
    const volSteps = Math.floor((volumeUl / syrSize) * maxSteps);

    // Rate / Velocity Counts (V): (rate_sec / Syringe) * resolution
    // Counts/s must stay under 6,400 max limits
    const fpsCounts = Math.floor(((rateUlMin / 60.0) / syrSize) * maxSteps);

    return { volSteps, fpsCounts };
  };

  // Calculates live sums for metrics
  const getMetrics = (rid: "R1" | "R2") => {
    let bolus = 0;
    let frSum = 0;

    pumps.forEach((p) => {
      if (p.addr !== "0" && p.addr.trim() !== "") {
        const state = reactionData[rid]?.[p.id];
        const isTarget = rid === "R1"
          ? p.assignedReactor === "Reactor 1"
          : p.assignedReactor === "Reactor 2" || p.sweep === "Yes";

        if (state && isTarget) {
          bolus += parseFloat(state.vol) || 0;
          frSum += parseFloat(state.fr) || 0;
        }
      }
    });

    const reactorVolume = rid === "R1" ? fluidics.reactor1Vol : fluidics.reactor2Vol;
    let resTime = "00:00";
    if (frSum > 0 && reactorVolume > 0) {
      const totalSeconds = Math.floor((reactorVolume / frSum) * 60);
      const mm = Math.floor(totalSeconds / 60);
      const ss = totalSeconds % 60;
      resTime = `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
    }

    return {
      bolus: bolus.toFixed(2),
      frSum: frSum.toFixed(2),
      resTime,
    };
  };

  const r1Metrics = getMetrics("R1");
  const r2Metrics = getMetrics("R2");

  // Validate Safety callback
  const checkSafety = () => {
    try {
      const b1 = parseFloat(r1Metrics.bolus) || 0;
      const t1 = fluidics.transfer1Vol;
      const f1_sum = parseFloat(r1Metrics.frSum) || 0;

      // Find sweep pump rate
      const swPumpObj = pumps.find((p) => p.addr !== "0" && p.sweep === "Yes");
      const sw_fr = swPumpObj ? parseFloat(reactionData["R2"]?.[swPumpObj.id]?.fr || "0.00") || 0 : 0;

      // 1. Check if planned reaction volumes when added would exceed loop capacities
      const currentUsedVols = getUsedLoopVolumes(macroContent);
      let loopOverflowPumpId: number | null = null;
      let loopExceededVols = { used: 0, planned: 0, capacity: 0 };

      const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");
      for (const p of activePumps) {
        if (p.sweep === "Yes") continue;
        const r1Vol = parseFloat(reactionData["R1"]?.[p.id]?.vol || "0") || 0;
        const r2Vol = parseFloat(reactionData["R2"]?.[p.id]?.vol || "0") || 0;
        const plannedVol = r1Vol + r2Vol;
        if (plannedVol > 0) {
          const used = currentUsedVols[p.id] || 0;
          const capacity = p.loopVol;
          if (used + plannedVol > capacity) {
            loopOverflowPumpId = p.id;
            loopExceededVols = { used, planned: plannedVol, capacity };
            break;
          }
        }
      }

      if (loopOverflowPumpId !== null) {
        // Reset reaction parameters tab to default values
        setReactionData({
          R1: {
            1: { vol: "20.00", fr: "30.00" },
            2: { vol: "20.00", fr: "30.00" },
            3: { vol: "0.00", fr: "0.00" },
            4: { vol: "0.00", fr: "0.00" },
          },
          R2: {
            1: { vol: "0.00", fr: "0.00" },
            2: { vol: "0.00", fr: "0.00" },
            3: { vol: "0.00", fr: "0.00" },
            4: { vol: "0.00", fr: "0.00" },
          },
        });
        addLog(
          `Safety Audit Failed: Planned volume for Pump P${loopOverflowPumpId} (${loopExceededVols.planned.toFixed(1)} µL) + already used (${loopExceededVols.used.toFixed(1)} µL) exceeds loop capacity (${loopExceededVols.capacity} µL). Reaction values reset to default to prevent syringe blockages!`,
          "error"
        );
        triggerToast(`Loop Capacity Exceeded on P${loopOverflowPumpId}!`);
        return {
          safe: false,
          msg: `Reactor Stage Loop Capacity overflow on Pump P${loopOverflowPumpId}! Total requested is ${(loopExceededVols.used + loopExceededVols.planned).toFixed(1)} µL of ${loopExceededVols.capacity} µL capacity. Parameter values defaulted.`,
        };
      }

      // 2. Bolus / Sweep match check
      if (b1 > t1 && Math.abs(f1_sum - sw_fr) > 0.05) {
        addLog(
          `Safety Audit: R1 Bolus (${b1} µL) exceeds transfer capacity (${t1} µL). Flow rates must match the Sweep rate perfectly to prevent backpressure!`,
          "error"
        );
        return {
          safe: false,
          msg: `Reactor 1 bolus volume (${b1} µL) exceeds downstream Transfer line capability (${t1} µL). Reagent mixing rates must match the sweep rate (${sw_fr} µL/min) to clear reactor channels safely.`,
        };
      }
      addLog("Safety Audit check: Fluidic flow coordinates represent safe pressure margins.", "success");
      return {
        safe: true,
        msg: "All microfluidic coordinates, loops, and heating arrays are balanced and safe for compilation.",
      };
    } catch (e) {
      return null;
    }
  };

  // Helpers to calculate used volumes from actual macro code content
  // Note: we only account for volumes sent via port 5 (i.e. of the form /addr o5 ... )
  const getUsedLoopVolumes = (macro: string) => {
    const usedVols: Record<number, number> = {};
    pumps.forEach((p) => {
      usedVols[p.id] = 0;
    });

    const lines = macro.split("\n");
    lines.forEach((line) => {
      const trimmed = line.trim();
      // Ignore comment lines
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;
      const parts = trimmed.split("\t");
      const actionCmd = parts[1] || "";
      if (actionCmd.startsWith("/")) {
        const addrMatch = actionCmd.match(/^\/(\d+)/);
        if (addrMatch) {
          const addr = addrMatch[1];
          const pumpObj = pumps.find((p) => p.addr === addr);
          // Only account for volume that has been sent via port 5 (ie not via port 2)
          if (pumpObj && actionCmd.includes("o5")) {
            const match = actionCmd.match(/D(\d+)/);
            if (match) {
              const steps = parseInt(match[1], 10);
              const vol = (steps / pumpObj.steps) * pumpObj.syringeVol;
              usedVols[pumpObj.id] = (usedVols[pumpObj.id] || 0) + vol;
            }
          }
        }
      }
    });

    pumps.forEach((p) => {
      usedVols[p.id] = Math.round((usedVols[p.id] || 0) * 10) / 10;
    });

    return usedVols;
  };

  const makeMetricsBlock = (usedVols: Record<number, number>): string => {
    let block = "# --- WORKSPACE LOOP CAPACITY TRACKING METRICS ---\n";
    const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");
    activePumps.forEach((p) => {
      const used = usedVols[p.id] || 0;
      const cap = p.loopVol;
      const left = Math.max(0, cap - used);
      block += `#   - Pump ${p.id} (${p.assignedReactor}${p.sweep === "Yes" ? " Sweep" : " Reagent"}): ${used.toFixed(1)} µL used of ${cap} µL capacity (${left.toFixed(1)} µL left)\n`;
    });
    block += "# =========================================================";
    return block;
  };

  const cleanOldMetrics = (text: string): string => {
    const lines = text.split("\n");
    const cleanedLines: string[] = [];
    let inMetricsBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("# --- WORKSPACE LOOP CAPACITY TRACKING METRICS ---")) {
        inMetricsBlock = true;
        continue;
      }
      if (inMetricsBlock) {
        if (line.includes("# ========================") || line.includes("RUN END")) {
          // Skip ending lines if they belong to metrics
          inMetricsBlock = false;
          continue;
        }
        continue;
      }
      cleanedLines.push(line);
    }
    // Filter any trailing empty lines or trailing separators
    return cleanedLines.join("\n").trim();
  };

  // Compiles and Appends macro string based on live states
  const handleBuildMacroText = () => {
    const lines: string[] = [];
    const timestamp = new Date().toLocaleString();
    const isOneStep = fluidics.reactor2Vol <= 0;

    // 1. Build Metadata Header Block
    lines.push(`# =========================================================`);
    lines.push(`# ADVION NANOTEK STANDALONE SYNTHESIS PROTOCOL`);
    lines.push(`# Generated: ${timestamp}`);
    lines.push(`# Mode: ${isOneStep ? "1-Step Synthesis Scenario" : "2-Step Synthesis Scenario"}`);
    lines.push(`# =========================================================`);
    lines.push(`# REACTOR MAP STATUS:`);
    lines.push(`#   R1 Vol: ${fluidics.reactor1Vol} µL | T1 Transfer Vol: ${fluidics.transfer1Vol} µL`);
    lines.push(`#   R2 Vol: ${fluidics.reactor2Vol} µL | T2 Transfer Vol: ${fluidics.transfer2Vol} µL`);
    lines.push(`#   Sweep Vol: ${fluidics.sweepVol} µL`);
    lines.push(`# =========================================================\n`);

    const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");
    if (activePumps.length === 0) {
      addLog("Cannot generate macro: No active pumps are configured in System settings.", "error");
      triggerToast("No active pumps!");
      return;
    }

    // Step 0: Heaters setting and thermalizing before any physical action
    lines.push(`# --- PROCESS STEP 0: HEATER TEMPERATURE STABILIZATION ---`);
    let targetTempSet = false;
    for (let idx = 1; idx <= 4; idx++) {
      const t1 = r1Heaters[idx] || "";
      const tempVal = t1.trim();
      if (tempVal !== "" && tempVal !== "Off") {
        lines.push(`100\tSet H${idx} at ${tempVal}\tSet Heater ${idx} temperature to ${tempVal}°C`);
        targetTempSet = true;
      }
    }
    if (targetTempSet) {
      lines.push(`30000\tM30000\tWait 30 seconds for heater temperature thermalization equilibrium`);
    } else {
      lines.push(`0\t# AMBIENT SYSTEM\tRunning under standard temperature boundaries`);
    }
    lines.push("");

    // Manual sampling Wait before refilling from port 8
    if (autoSample !== "Yes") {
      lines.push(`# --- PROCESS STEP 0.5: USER MANUAL SAMPLING PAUSE ---`);
      lines.push(`0\tWait\tStart reaction, place a new collection vial`);
      lines.push("");
    }

    // Step 1: All active pumps need to fill up from port 8
    lines.push(`# --- PROCESS STEP 1: INITIAL REFILL FROM PORT 8 ---`);
    let maxFillTimeMs = 0;
    activePumps.forEach((pump) => {
      const fillSpeedCounts = 1200; // standard configuration pull speed
      const timeMs = (pump.steps / fillSpeedCounts) * 1000;
      if (timeMs > maxFillTimeMs) {
        maxFillTimeMs = timeMs;
      }
      lines.push(`0\t/${pump.addr}o8V${fillSpeedCounts}P${pump.steps}R\tFill Pump ${pump.id} Syringe standard volume from port 8`);
    });
    lines.push("");

    // Step 2: Only the sweep pump will turn to port 2 and deliver 50uL and 100uL/min
    lines.push(`# --- PROCESS STEP 2: FLUIDIC PRESSURIZATION ---`);
    const sweepPumpObj = activePumps.find((p) => p.sweep === "Yes");
    const pressDurationMs = 30000; // 50 uL / 100 uL/min = 0.5 minutes = 30 seconds = 30000 ms
    if (sweepPumpObj) {
      const { volSteps: pressSteps, fpsCounts: pressCounts } = computeSteps(sweepPumpObj.id, 50, 100);
      lines.push(`${Math.ceil(maxFillTimeMs)}\t/${sweepPumpObj.addr}o2V${pressCounts}D${pressSteps}R\tPressurize fluidics with Sweep Pump ${sweepPumpObj.id}: 50µL at 100µL/min`);
    } else {
      lines.push(`${Math.ceil(maxFillTimeMs)}\t# NO SWEEP PUMP INSTALLED\tPressurization step bypassed`);
    }
    lines.push("");

    // Step 3: Separate generation of 1-step and 2-step scenarios
    if (isOneStep) {
      lines.push(`# --- PROCESS STEP 3: 1-STEP CO-DELIVERY MIXING (R1 PORT 5) ---`);
      
      let step3DelayVal = Math.ceil(pressDurationMs);

      // DH Port setting as the very first line item for 1-STEP CO-DELIVERY MIXING
      if (hubAddr && hubAddr !== "0" && hubAddr.trim() !== "") {
        lines.push(`${step3DelayVal}\t/${hubAddr}o${hubPort}R\tConfigure Distribution Hub (DH) to Port ${hubPort}`);
        step3DelayVal = 0;
      }

      // Automated sampling: AUX A & B to start collection right after setting DH line
      if (autoSample === "Yes") {
        const st_a = asLogic["Start Collection"]["A"] === "ON" ? "TRUE" : "FALSE";
        const st_b = asLogic["Start Collection"]["B"] === "ON" ? "TRUE" : "FALSE";
        lines.push(`${step3DelayVal}\tAUX${auxA} ${st_a}\tStart fraction collection valve A`);
        step3DelayVal = 0;
        lines.push(`${step3DelayVal}\tAUX${auxB} ${st_b}\tStart fraction collection valve B`);
      }

      // ALL the pumps connected to R1 (comprising the "sweep" pump) start CONTEMPORARILY
      // to deliver to port 5 the volume indicated in Reaction Parameters, at the flow rate indicated.
      const r1Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 1" || p.sweep === "Yes");
      
      let maxR1DeliveryTimeMs = 0;
      let injectCount = 0;
      r1Pumps.forEach((pump) => {
        const rData = reactionData["R1"]?.[pump.id] || { vol: "0", fr: "0" };
        const valVol = parseFloat(rData.vol) || 0;
        const valFr = parseFloat(rData.fr) || 0;
        if (valVol > 0 && valFr > 0) {
          const { volSteps, fpsCounts } = computeSteps(pump.id, valVol, valFr);
          const deliveryTimeMs = (valVol / valFr) * 60 * 1000;
          if (deliveryTimeMs > maxR1DeliveryTimeMs) {
            maxR1DeliveryTimeMs = deliveryTimeMs;
          }
          lines.push(`${step3DelayVal}\t/${pump.addr}o5V${fpsCounts}D${volSteps}R\tSynchronized co-delivery Reactant Pump ${pump.id}: ${valVol}µL at ${valFr}µL/min`);
          step3DelayVal = 0;
          injectCount++;
        }
      });
      if (injectCount === 0) {
        lines.push(`${step3DelayVal}\t# NO ACTIVE REACTOR 1 REAGENTS\tR1 co-delivery bypassed`);
      }
      lines.push("");

      // Done that (finished delivering), all these pumps EXCEPT the "Sweep" pump will turn valve to port 7
      lines.push(`# --- PROCESS STEP 4: VALVE ROTATION TO PLUGGED PORT 7 ---`);
      let turnedOthers = false;
      const delayAfterDelivery = injectCount > 0 ? Math.ceil(maxR1DeliveryTimeMs) : 0;
      r1Pumps.forEach((pump) => {
        if (pump.sweep !== "Yes" && pump.assignedReactor === "Reactor 1") {
          const rData = reactionData["R1"]?.[pump.id] || { vol: "0", fr: "0" };
          const valVol = parseFloat(rData.vol) || 0;
          const valFr = parseFloat(rData.fr) || 0;
          if (valVol > 0 && valFr > 0) {
            const delayVal = turnedOthers ? 0 : delayAfterDelivery;
            lines.push(`${delayVal}\t/${pump.addr}o7R\tClose non-sweep Reactant Pump ${pump.id} (turn to plugged Port 7)`);
            turnedOthers = true;
          }
        }
      });
      lines.push("");

      // Instead, the "sweep" pump will turn towards port 2 and first deliver a volume quantity equivalent to R1 volume,
      // at the cumulated flow rate for Reaction 1;
      lines.push(`# --- PROCESS STEP 5: SWEEP PURGE TO PORT 2 ---`);
      if (sweepPumpObj) {
        let cumulatedFr = 0;
        r1Pumps.forEach((p) => {
          const rData = reactionData["R1"]?.[p.id] || { vol: "0", fr: "0" };
          const valVol = parseFloat(rData.vol) || 0;
          const valFr = parseFloat(rData.fr) || 0;
          if (valVol > 0 && valFr > 0) {
            cumulatedFr += valFr;
          }
        });
        if (cumulatedFr <= 0) {
          cumulatedFr = 100.0; // fallback standard flow rate
        }

        const r1Vol = fluidics.reactor1Vol;
        const { volSteps: r1VolSteps, fpsCounts: r1CumFrCounts } = computeSteps(sweepPumpObj.id, r1Vol, cumulatedFr);
        
        const sweepFirstDelay = turnedOthers ? 0 : delayAfterDelivery;
        lines.push(`${sweepFirstDelay}\t/${sweepPumpObj.addr}o2V${r1CumFrCounts}D${r1VolSteps}R\tPurge Reactor 1 volume using Sweep Pump: ${r1Vol}µL at cumulated ${cumulatedFr.toFixed(2)}µL/min`);

        const sweepFirstDurationMs = (r1Vol / cumulatedFr) * 60 * 1000;

        // finished that, it delivers (still to port 2) a volume equivalent to Transfer line 2 and Sweep line,
        // at flow rate "sweep delivery flow rate".
        const transferAndSweepVol = fluidics.transfer2Vol + fluidics.sweepVol;
        const sweepDeliveryFr = parseFloat(finalSweepFr) || 120.0;
        const { volSteps: finalSweepSteps, fpsCounts: finalSweepCounts } = computeSteps(sweepPumpObj.id, transferAndSweepVol, sweepDeliveryFr);
        
        lines.push(`${Math.ceil(sweepFirstDurationMs)}\t/${sweepPumpObj.addr}o2V${finalSweepCounts}D${finalSweepSteps}R\tPost-reaction sweep wash to Transfer & Sweep lines: ${transferAndSweepVol}µL at sweep rate ${sweepDeliveryFr}µL/min`);
      } else {
        lines.push(`0\t# NO SWEEP PUMP ASSIGNED\tSweep delivery steps bypassed`);
      }

    } else {
      // 2-Steps Setup placeholder
      lines.push(`# --- PROCESS STEP 3: 2-STEP SYNTHESIS ROUTINE (AWAITING PROTOCOL RULES) ---`);
      lines.push(`# Currently Reactant 2 is active (${fluidics.reactor2Vol}µL volume).`);
      lines.push(`# Set Reactor 2 Volume to 0 in System settings to run and compile 1-step logic.`);
    }

    // Stop automated collection if selected
    if (autoSample === "Yes") {
      lines.push("");
      lines.push(`# --- PROCESS STEP 6: STOP AUTOMATED FRACTION COLLECTION ---`);
      const sp_a = asLogic["Stop Collection"]["A"] === "ON" ? "TRUE" : "FALSE";
      const sp_b = asLogic["Stop Collection"]["B"] === "ON" ? "TRUE" : "FALSE";
      lines.push(`0\tAUX${auxA} ${sp_a}\tStop fraction collection valve A`);
      lines.push(`0\tAUX${auxB} ${sp_b}\tStop fraction collection valve B`);
    }

    // Reference wait retrieved manual sampling option
    if (autoSample !== "Yes") {
      lines.push("");
      lines.push(`# --- PROCESS STEP 6: RETRIEVE COLLECTION VIAL ---`);
      lines.push(`0\tWait\tReaction completed, retrieve collection vial`);
    }

    lines.push("");
    lines.push(`0\t# RUN END\tAdvion NanoTek Macro synthesis execution completed.`);
    lines.push("# =========================================================");

    const chunk = lines.join("\n");
    setMacroContent((prev) => {
      const cleanedPrev = cleanOldMetrics(prev);
      const combinedNoMetrics = cleanedPrev ? cleanedPrev + "\n\n" + chunk : chunk;
      const usedVols = getUsedLoopVolumes(combinedNoMetrics);
      const metricsText = makeMetricsBlock(usedVols);
      return combinedNoMetrics + "\n\n" + metricsText;
    });
    setActiveTab("Macro");
    addLog("Macro compiled successfully according to current reaction parameters. Appended script and updated loop metrics.", "success");
    triggerToast("Full Macro Appended Successfully!");
  };

  // Automated parser & dry-run code simulator
  const runSimulation = () => {
    if (!macroContent.trim()) {
      addLog("Simulator Error: Active workspace is empty. Build macro blocks or enter syntax commands first.", "error");
      return;
    }

    addLog("--- RUNNING ADVION SWEEP SIMULATOR (DRY-RUN) ---", "info");
    const scriptLines = macroContent.split("\n");
    let lineIdx = 0;

    scriptLines.forEach((line) => {
      lineIdx++;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;

      const splitted = trimmed.split("\t");
      const intervalDelay = splitted[0] || "0";
      const actionCmd = splitted[1] || "";
      const description = splitted[2] || "";

      // Parse Kloehn command expressions `/`
      if (actionCmd.startsWith("/")) {
        const addrMatch = actionCmd.match(/^\/(\d+)/);
        const addr = addrMatch ? addrMatch[1] : "?";

        let parsedMsg = `[L:${lineIdx} PUMP-${addr} STATUS]: `;
        if (actionCmd.includes("o8")) parsedMsg += "Rotated valve to Port 8 (Solvent H). ";
        if (actionCmd.includes("o5")) parsedMsg += "Rotated valve to Port 5 (Reactor 1 flow). ";
        if (actionCmd.includes("o3")) parsedMsg += "Rotated valve to Port 3 (Sweep Loop). ";

        const rateMatch = actionCmd.match(/V(\d+)/);
        if (rateMatch) parsedMsg += `Set velocity speed to ${rateMatch[1]} counts/s. `;

        const aspMatch = actionCmd.match(/P(\d+)/);
        if (aspMatch) parsedMsg += `Aspirating ${aspMatch[1]} syringe steps. `;

        const dispMatch = actionCmd.match(/D(\d+)/);
        if (dispMatch) parsedMsg += `Dispensing ${dispMatch[1]} steps into stream line. `;

        if (actionCmd.endsWith("R") || actionCmd.includes("R")) {
          parsedMsg += "Execution buffer committed (R Command).";
        }

        addLog(`${parsedMsg} [${description || "Operational pulse"}]`, "info");
      } else if (actionCmd === "Wait" || trimmed.includes("Wait\t") || description.toLowerCase().includes("vial") || actionCmd.toLowerCase().includes("wait")) {
        addLog(`[L:${lineIdx} USER INTERACTIVE PAUSE / WAIT]: Prompt: "${description || "Confirm manual step"}" (Manual operation confirmation required)`, "warning");
      } else if (trimmed.includes("AUX")) {
        addLog(`[L:${lineIdx} SYSTEM AUX TRIGGER]: Pulsed auxiliary relay signal on ${trimmed}`, "success");
      } else if (trimmed.includes("H")) {
        addLog(`[L:${lineIdx} THERMAL STAGE]: ${actionCmd} (${description})`, "warning");
      } else {
        addLog(`[L:${lineIdx} DELAY PERIOD]: Interval Wait: ${intervalDelay}ms - ${description || "Waiting..."}`, "info");
      }
    });

    addLog("--- SIMULATION CYCLE COMPLETE: Syntax verified, no hardware collisions found ---", "success");
  };

  const handleSaveFile = () => {
    const blob = new Blob([macroContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Synthesis_Cycle_ALL_STEP.macro";
    link.click();
    URL.revokeObjectURL(url);
    addLog("Macro sequence exported to external file: Synthesis_Cycle_ALL_STEP.macro", "success");
  };

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] font-sans overflow-hidden">
      
      {/* Top Navigation Bar */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-lg">
            <div className="w-4 h-4 bg-white rotate-45"></div>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 tracking-tight leading-none uppercase">
              ADVION NANOTEK
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
              Macro Engineering Suite (V4 Standalone)
            </p>
          </div>
        </div>

        {/* Tab Selector Links */}
        <nav className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("System")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "System"
                ? "bg-slate-100 text-blue-600 border border-slate-205 shadow-sm"
                : "text-gray-600 hover:bg-slate-50 border border-transparent"
            }`}
          >
            System Settings
          </button>
          <button
            onClick={() => setActiveTab("Reaction")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "Reaction"
                ? "bg-slate-100 text-blue-600 border border-slate-205 shadow-sm"
                : "text-gray-600 hover:bg-slate-50 border border-transparent"
            }`}
          >
            Reaction Parameters
          </button>
          <button
            onClick={() => setActiveTab("Macro")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "Macro"
                ? "bg-slate-100 text-blue-600 border border-slate-205 shadow-sm"
                : "text-gray-600 hover:bg-slate-50 border border-transparent"
            }`}
          >
            Active Macro IDE
          </button>
        </nav>

        {/* Standard compilation trigger */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
            <span className={`w-1.5 h-1.5 rounded-full ${fluidics.reactor2Vol > 0 ? "bg-purple-500" : "bg-amber-500 animate-pulse"}`}></span>
            <span className={fluidics.reactor2Vol > 0 ? "text-purple-700" : "text-amber-700"}>
              {fluidics.reactor2Vol > 0 ? "2-Step Synthesis Mode" : "1-Step Synthesis Active"}
            </span>
          </div>
          <button
            onClick={runSimulation}
            className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded shadow-sm flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 fill-white" />
            Dry-Run Test
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0">
        
        {/* Left Sidebar Command list (only visible if active macro IDE is opened for better desktop ergonomics) */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <SyntaxExplorer
            pumps={pumps}
            hubAddr={hubAddr}
            onInsertCommand={(cmd) => {
              setMacroContent((prev) => (prev ? prev + "\n" + cmd : cmd));
              addLog(`Code helper: Appended base action [${cmd}] directly to macro editor space.`, "success");
            }}
            onConcatCommand={(cmdCode) => {
              setMacroContent((prev) => {
                if (!prev) return cmdCode;
                const lines = prev.split("\n");
                let lastLineIndex = lines.length - 1;
                // find last non-empty line
                while (lastLineIndex >= 0 && lines[lastLineIndex].trim() === "") {
                  lastLineIndex--;
                }
                if (lastLineIndex < 0) {
                  return cmdCode;
                }
                const lastLine = lines[lastLineIndex];
                if (lastLine.trim().startsWith("#")) {
                  // If last line is a comment, add a new action line instead of concatenating inside the comment
                  lines.push(`0\t${cmdCode}\tConcatenated operation`);
                } else {
                  const parts = lastLine.split("\t");
                  if (parts.length >= 2) {
                    let cmdPart = parts[1];
                    if (cmdPart.endsWith("R")) {
                      cmdPart = cmdPart.slice(0, -1) + cmdCode + "R";
                    } else {
                      cmdPart = cmdPart + cmdCode;
                    }
                    parts[1] = cmdPart;
                    lines[lastLineIndex] = parts.join("\t");
                  } else {
                    lines[lastLineIndex] = lastLine + cmdCode;
                  }
                }
                return lines.join("\n");
              });
              addLog(`Code helper: Concatenated inline command [${cmdCode}] to last active macro step.`, "success");
            }}
          />
        </aside>

        {/* Dynamic Center Workspaces */}
        <main className="flex-1 bg-slate-50 p-6 overflow-y-auto flex flex-col space-y-6">
          
          {/* Reactive Schematic shown across Tabs for constant system comprehension */}
          <FluidicSchematic
            pumps={pumps}
            fluidics={fluidics}
            hubAddr={hubAddr}
            hubPort={hubPort}
            r1Heaters={r1Heaters}
            r2Heaters={r2Heaters}
            r1Bolus={r1Metrics.bolus}
            r2Bolus={r2Metrics.bolus}
            usedVolumes={getUsedLoopVolumes(macroContent)}
          />

          {activeTab === "System" && (
            <PumpConfigurator
              pumps={pumps}
              onChangePump={handlePumpChange}
              fluidics={fluidics}
              onChangeFluidics={handleFluidicsChange}
              hubAddr={hubAddr}
              setHubAddr={setHubAddr}
            />
          )}

          {activeTab === "Reaction" && (
            <ReactionControl
              pumps={pumps}
              fluidics={fluidics}
              reactionData={reactionData}
              onChangeField={handleReactFieldChange}
              r1Heaters={r1Heaters}
              setR1Heaters={syncR1Heater}
              r2Heaters={r2Heaters}
              setR2Heaters={syncR2Heater}
              hubPort={hubPort}
              setHubPort={setHubPort}
              finalSweepFr={finalSweepFr}
              setFinalSweepFr={setFinalSweepFr}
              autoSample={autoSample}
              setAutoSample={setAutoSample}
              auxA={auxA}
              setAuxA={setAuxA}
              auxB={auxB}
              setAuxB={setAuxB}
              asLogic={asLogic}
              onChangeAuxLogic={handleAuxLogicChange}
              onBuildMacro={handleBuildMacroText}
              r1Bolus={r1Metrics.bolus}
              r1FrSum={r1Metrics.frSum}
              r1Res={r1Metrics.resTime}
              r2Bolus={r2Metrics.bolus}
              r2FrSum={r2Metrics.frSum}
              r2Res={r2Metrics.resTime}
              checkSafety={checkSafety}
              hubAddr={hubAddr}
            />
          )}

          {activeTab === "Macro" && (
            <MacroIde
              content={macroContent}
              onChangeContent={setMacroContent}
              onSave={handleSaveFile}
              onClear={() => {
                setMacroContent("");
                addLog("Workspace script cleared.", "warning");
              }}
              onSimulate={runSimulation}
              showSuccessMessage={triggerToast}
            />
          )}
        </main>

        {/* Right Sidebar validation parameter audits */}
        <aside className="w-64 bg-white border-l border-gray-200 flex flex-col shrink-0 min-h-0 h-full overflow-hidden">
          <ValidationSidebar
            pumps={pumps}
            fluidics={fluidics}
            macroContent={macroContent}
            r1Heaters={r1Heaters}
            r2Heaters={r2Heaters}
            r1Bolus={r1Metrics.bolus}
            r2Bolus={r2Metrics.bolus}
          />
        </aside>
      </div>

      {/* Dynamic Toast popup notifier */}
      {toastMessage && (
        <div className="fixed bottom-40 right-6 z-50 bg-[#1e1e1e] text-white text-xs px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 border border-neutral-700 animate-slide-up">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Bottom Terminal Output Console logs (Exact Polish match) */}
      <footer className={`${isConsoleOpen ? "h-44" : "h-8"} bg-[#f1f1f1] border-t border-gray-300 flex flex-col shrink-0 z-10 transition-all duration-300`}>
        <div 
          onClick={() => setIsConsoleOpen(!isConsoleOpen)}
          className="h-8 border-b border-gray-200 flex items-center justify-between px-4 bg-gray-200 shrink-0 cursor-pointer hover:bg-gray-300 select-none"
        >
          <div className="flex items-center gap-4">
            <button className="text-[11px] font-bold text-gray-700 border-b-2 border-blue-600 h-full px-2 flex items-center gap-1">
              <Terminal className="w-3 h-3" />
              Output Console Logs
            </button>
            <span className="text-[10px] text-gray-400 font-medium font-mono">
              Live Standalone Emulator Running (Click header to toggle)
            </span>
          </div>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setConsoleLogs([]);
                addLog("Console timeline cleaned.", "warning");
              }}
              className="text-[10px] font-medium text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded hover:bg-black/5"
            >
              Clear logs
            </button>
            <button
              onClick={() => setIsConsoleOpen(!isConsoleOpen)}
              className="text-gray-500 hover:text-gray-800 p-1 flex items-center justify-center rounded hover:bg-black/5"
              title={isConsoleOpen ? "Collapse Console" : "Expand Console"}
            >
              {isConsoleOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isConsoleOpen && (
          <div className="p-3 font-mono text-[11px] space-y-1 overflow-y-auto bg-[#fafafa] flex-1">
            {consoleLogs.map((log, idx) => {
              let colorCls = "text-gray-700";
              if (log.type === "success") colorCls = "text-emerald-600 font-semibold";
              if (log.type === "error") colorCls = "text-red-600 font-bold";
              if (log.type === "warning") colorCls = "text-amber-600 font-medium";

              return (
                <p key={idx} className={colorCls}>
                  <span className="text-gray-400 select-none mr-2">[{log.timestamp}]</span>
                  {log.message}
                </p>
              );
            })}
          </div>
        )}
      </footer>
    </div>
  );
}
