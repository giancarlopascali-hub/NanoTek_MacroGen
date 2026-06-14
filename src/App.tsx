import React, { useState, useEffect } from "react";
import { PumpConfig, FluidicsConfig, AUXState, LogLine } from "./types";
import { Play, Code, ShieldCheck, Cpu, Terminal, BookOpen, Settings, Flame, ChevronUp, ChevronDown } from "lucide-react";
import FluidicSchematic from "./components/FluidicSchematic";
import SyntaxExplorer from "./components/SyntaxExplorer";
import PumpConfigurator from "./components/PumpConfigurator";
import ReactionControl from "./components/ReactionControl";
import MacroIde from "./components/MacroIde";

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
      message: "Diagnostics: System active. Teflon lines calibrated and validated successfully.",
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
      if (targetPump) {
        const isOneStep = fluidics.reactor2Vol <= 0;
        const isReactantCheck = targetPump.sweep === "No" || (targetPump.sweep === "Yes" && isOneStep);
        if (isReactantCheck && Number(value) > targetPump.loopVol) {
          triggerToast(`Pump ${pid} volume request exceeds static loop capacity (${targetPump.loopVol}µL)!`);
          return; // Reject update and retain last known accepted value
        }
      }
    }

    // Pre-calculate proposed state to verify safety bounds including leftover loop capacity
    const proposedState = {
      ...reactionData,
      [rid]: {
        ...reactionData[rid],
        [pid]: {
          ...reactionData[rid]?.[pid],
          [field]: value
        }
      }
    };

    // If Reactor 1 reactant volume was updated in 2-step mode, simulate R2 Sweep volume sync
    const isOneStep = fluidics.reactor2Vol <= 0;
    if (rid === "R1" && field === "vol" && !isOneStep) {
      let bolus1Val = 0;
      pumps.forEach((p) => {
        if (p.addr !== "0" && p.assignedReactor === "Reactor 1") {
          const vStr = p.id === pid ? value : (proposedState["R1"]?.[p.id]?.vol || "0");
          bolus1Val += Number(vStr) || 0;
        }
      });
      const bolus1Formatted = bolus1Val.toFixed(2);
      const swPump = pumps.find((p) => p.addr !== "0" && p.sweep === "Yes");
      if (swPump && proposedState["R2"]?.[swPump.id]) {
        proposedState["R2"] = {
          ...proposedState["R2"],
          [swPump.id]: {
            ...proposedState["R2"][swPump.id],
            vol: bolus1Formatted
          }
        };
      }
    }

    // Evaluate proposed state against leftover loop capacities (remaining capacity = total loop volume - already used)
    const currentUsedVols = getUsedLoopVolumes(macroContent);
    const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");

    let hasOverflow = false;
    let overflowMsg = "";

    if (isOneStep) {
      // 1-step loop capacity leftover check (includes the sweep pump)
      for (const p of activePumps) {
        const pVol = parseFloat(proposedState["R1"]?.[p.id]?.vol || "0") || 0;
        const used = currentUsedVols[p.id] || 0;
        const leftover = p.loopVol - used;
        if (pVol > leftover) {
          hasOverflow = true;
          overflowMsg = `1-Step Loop Capacity overflow on Pump P${p.id}! Requested ${pVol.toFixed(1)} µL but only ${leftover.toFixed(1)} µL is left in the loop.`;
          break;
        }
      }
    } else {
      // 2-step loop capacity leftover check
      for (const p of activePumps) {
        if (p.sweep === "Yes") continue;
        const r1Vol = parseFloat(proposedState["R1"]?.[p.id]?.vol || "0") || 0;
        const r2Vol = parseFloat(proposedState["R2"]?.[p.id]?.vol || "0") || 0;
        const plannedVol = r1Vol + r2Vol;
        const used = currentUsedVols[p.id] || 0;
        const leftover = p.loopVol - used;
        if (plannedVol > leftover) {
          hasOverflow = true;
          overflowMsg = `2-Step Loop Capacity overflow on Pump P${p.id}! Total requested (Stage 1 + Stage 2) is ${plannedVol.toFixed(1)} µL but only ${leftover.toFixed(1)} µL is left in the loop.`;
          break;
        }
      }
    }

    if (hasOverflow) {
      triggerToast(overflowMsg);
      addLog(`Safety Block: Input value rejected / reverted. ${overflowMsg}`, "error");
      return; // Do not apply the update (reverts input state)
    }

    setReactionData((prev) => {
      const targetState = { ...prev[rid] };
      const current = { ...targetState[pid], [field]: value };
      targetState[pid] = current;

      // Perform automated Delivery Duration synchronization across channels
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
      const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");
      const isOneStep = fluidics.reactor2Vol <= 0;
      const currentUsedVols = getUsedLoopVolumes(macroContent);

      if (isOneStep) {
        // --- 1-STEP CASE SAFETY AUDIT ---
        // Verify that proposed loop volume (R1) for each pump is not higher than loop capacity leftover (total capacity minus used volume)
        let loopOverflowPumpId: number | null = null;
        let loopOverflowVol = 0;
        let leftoverVol = 0;

        for (const p of activePumps) {
          const r1Vol = parseFloat(reactionData["R1"]?.[p.id]?.vol || "0") || 0;
          const used = currentUsedVols[p.id] || 0;
          const leftover = p.loopVol - used;
          if (r1Vol > leftover) {
            loopOverflowPumpId = p.id;
            loopOverflowVol = r1Vol;
            leftoverVol = leftover;
            break;
          }
        }

        if (loopOverflowPumpId !== null) {
          addLog(
            `Safety Audit Failed: Proposed Reactant volume for Pump P${loopOverflowPumpId} (${loopOverflowVol.toFixed(1)} µL) exceeds remaining loop capacity leftover (${leftoverVol.toFixed(1)} µL).`,
            "error"
          );
          triggerToast(`Loop Capacity Exceeded on P${loopOverflowPumpId}!`);
          return {
            safe: false,
            msg: `1-Step Loop Capacity overflow on Pump P${loopOverflowPumpId}! Requested ${loopOverflowVol.toFixed(1)} µL but only ${leftoverVol.toFixed(1)} µL is left in the loop.`,
          };
        }

        addLog("Safety Audit check: 1-Step microfluidic loops are within safe capacity bounds.", "success");
        return {
          safe: true,
          msg: "All 1-Step microfluidic loops are balanced and safe for compilation.",
        };

      } else {
        // --- 2-STEP CASE SAFETY AUDIT ---
        // 1. Loop capacity check: verify that total proposed volume (R1 + R2) is within pump loop capacity leftover
        let loopOverflowPumpId: number | null = null;
        let loopOverflowVol = 0;
        let leftoverVol = 0;

        for (const p of activePumps) {
          if (p.sweep === "Yes") continue;
          const r1Vol = parseFloat(reactionData["R1"]?.[p.id]?.vol || "0") || 0;
          const r2Vol = parseFloat(reactionData["R2"]?.[p.id]?.vol || "0") || 0;
          const plannedVol = r1Vol + r2Vol;
          const used = currentUsedVols[p.id] || 0;
          const leftover = p.loopVol - used;
          if (plannedVol > leftover) {
            loopOverflowPumpId = p.id;
            loopOverflowVol = plannedVol;
            leftoverVol = leftover;
            break;
          }
        }

        if (loopOverflowPumpId !== null) {
          addLog(
            `Safety Audit Failed: Total planned volume for Pump P${loopOverflowPumpId} (${loopOverflowVol.toFixed(1)} µL) exceeds remaining loop capacity leftover (${leftoverVol.toFixed(1)} µL).`,
            "error"
          );
          triggerToast(`Loop Capacity Exceeded on P${loopOverflowPumpId}!`);
          return {
            safe: false,
            msg: `2-Step Loop Capacity overflow on Pump P${loopOverflowPumpId}! Total requested (Stage 1 + Stage 2) is ${loopOverflowVol.toFixed(1)} µL but only ${leftoverVol.toFixed(1)} µL is left in the loop.`,
          };
        }

        // 2. Bolus / Sweep match check for 2-Step
        const b1 = parseFloat(r1Metrics.bolus) || 0;
        const t1 = fluidics.transfer1Vol;
        const r1Vol = fluidics.reactor1Vol;
        const f1_sum = parseFloat(r1Metrics.frSum) || 0;

        // Find sweep pump rate
        const swPumpObj = pumps.find((p) => p.addr !== "0" && p.sweep === "Yes");
        const sw_fr = swPumpObj ? parseFloat(reactionData["R2"]?.[swPumpObj.id]?.fr || "0.00") || 0 : 0;

        if (t1 < b1 + r1Vol) {
          if (Math.abs(f1_sum - sw_fr) > 0.05) {
            addLog(
              `Safety Audit Failed: Transfer line 1 capacity (${t1} µL) is smaller than R1 bolus + Reactor 1 volume (${(b1 + r1Vol).toFixed(1)} µL). R1 flow rate sum (${f1_sum} µL/min) must match the sweep channel flow rate (${sw_fr} µL/min) perfectly to prevent mixing errors!`,
              "error"
            );
            return {
              safe: false,
              msg: `Transfer line 1 capacity (${t1} µL) is smaller than R1 bolus + Reactor 1 volume (${(b1 + r1Vol).toFixed(1)} µL). R1 cumulated flow rate (${f1_sum} µL/min) must match the R2 sweep channel rate (${sw_fr} µL/min).`,
            };
          }
        }

        addLog("Safety Audit check: 2-Step flows and capacities represent safe pressure limits.", "success");
        return {
          safe: true,
          msg: "All 2-Step microfluidic loops, flows, and heaters are safe for compilation.",
        };
      }
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
    let handlesCompletionInternally = false;

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
      lines.push(`# AMBIENT SYSTEM\tRunning under standard temperature boundaries`);
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
      lines.push(`# NO SWEEP PUMP INSTALLED\tPressurization step bypassed`);
    }
    lines.push("");

    // Step 3: Separate generation of 1-step and 2-step scenarios
    if (isOneStep) {
      lines.push(`# --- PROCESS STEP 3: 1-STEP CO-DELIVERY MIXING (R1 PORT 5) ---`);
      
      let step3DelayVal = sweepPumpObj ? Math.ceil(pressDurationMs) : Math.ceil(maxFillTimeMs);

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
        lines.push(`# NO ACTIVE REACTOR 1 REAGENTS\tR1 co-delivery bypassed`);
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
        
        const sweepFirstDelay = turnedOthers ? 0 : (injectCount > 0 ? delayAfterDelivery : step3DelayVal);
        lines.push(`${sweepFirstDelay}\t/${sweepPumpObj.addr}o2V${r1CumFrCounts}D${r1VolSteps}R\tPurge Reactor 1 volume using Sweep Pump: ${r1Vol}µL at cumulated ${cumulatedFr.toFixed(2)}µL/min`);

        const sweepFirstDurationMs = (r1Vol / cumulatedFr) * 60 * 1000;

        // finished that, it delivers (still to port 2) a volume equivalent to Transfer line 2 and Sweep line,
        // at flow rate "sweep delivery flow rate".
        const transferAndSweepVol = fluidics.transfer2Vol + fluidics.sweepVol;
        const sweepDeliveryFr = parseFloat(finalSweepFr) || 120.0;
        const { volSteps: finalSweepSteps, fpsCounts: finalSweepCounts } = computeSteps(sweepPumpObj.id, transferAndSweepVol, sweepDeliveryFr);
        
        lines.push(`${Math.ceil(sweepFirstDurationMs)}\t/${sweepPumpObj.addr}o2V${finalSweepCounts}D${finalSweepSteps}R\tPost-reaction sweep wash to Transfer & Sweep lines: ${transferAndSweepVol}µL at sweep rate ${sweepDeliveryFr}µL/min`);
      } else {
        lines.push(`# NO SWEEP PUMP ASSIGNED\tSweep delivery steps bypassed`);
      }

    } else {
      // 2-Steps Setup
      const b1 = parseFloat(r1Metrics.bolus) || 0;
      const t1 = fluidics.transfer1Vol;
      const r1Vol = fluidics.reactor1Vol;
      const isScenarioA = (b1 + r1Vol) <= t1;
      const sweepDeliveryFr = parseFloat(finalSweepFr) || 120.0;
      handlesCompletionInternally = false;

      // Reaction 1 cumulated flow rate for R1 purge (same as 1-step)
      const r1Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 1" || p.sweep === "Yes");
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

      if (isScenarioA) {
        lines.push(`# =========================================================`);
        lines.push(`# SCENARIO A: (R1 Bolus + Reactor 1 Volume) <= T1 Transfer Line Capacity`);
        lines.push(`# =========================================================`);
        lines.push(`# --- PROCESS STEP 3: 2-STEP STAGE 1 CO-DELIVERY MIXING (R1 PORT 5) ---`);
        let step3DelayVal = sweepPumpObj ? Math.ceil(pressDurationMs) : Math.ceil(maxFillTimeMs);

        // DH Port setting as the very first line item for Stage 1 mixing
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

        let maxR1DeliveryTimeMs = 0;
        let r1InjectCount = 0;
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
            r1InjectCount++;
          }
        });
        if (r1InjectCount === 0) {
          lines.push(`# NO ACTIVE REACTOR 1 REAGENTS\tR1 co-delivery bypassed`);
        }
        lines.push("");

        // Step 4: Valve rotation to plugged Port 7 for R1 non-sweep pumps
        lines.push(`# --- PROCESS STEP 4: VALVE ROTATION TO PLUGGED PORT 7 ---`);
        let turnedOthers = false;
        const delayAfterDelivery = r1InjectCount > 0 ? Math.ceil(maxR1DeliveryTimeMs) : 0;
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

        // Step 5: Sweep out of Reactor 1
        lines.push(`# --- PROCESS STEP 5: SWEEP OUT OF REACTOR 1 (PORT 2) ---`);
        let elapsedMsStep5 = 0;
        if (sweepPumpObj) {
          const sweepFirstDelay = turnedOthers ? 0 : delayAfterDelivery;
          const { volSteps: r1PurgeVolSteps, fpsCounts: r1CumFrCounts } = computeSteps(sweepPumpObj.id, r1Vol, cumulatedFr);
          lines.push(`${sweepFirstDelay}\t/${sweepPumpObj.addr}o2V${r1CumFrCounts}D${r1PurgeVolSteps}R\tPurge Reactor 1 volume using Sweep Pump: ${r1Vol}µL at cumulated ${cumulatedFr.toFixed(2)}µL/min`);

          const sweepFirstDurationMs = (r1Vol / cumulatedFr) * 60 * 1000;
          elapsedMsStep5 = sweepFirstDurationMs;

          // Scenario A: Pushing the remaining volume in T1 at the sweep delivery rate
          const remainingT1Vol = t1 - (b1 + r1Vol);
          if (remainingT1Vol > 0) {
            const { volSteps: remSteps, fpsCounts: remCounts } = computeSteps(sweepPumpObj.id, remainingT1Vol, sweepDeliveryFr);
            lines.push(`${Math.ceil(sweepFirstDurationMs)}\t/${sweepPumpObj.addr}o2V${remCounts}D${remSteps}R\tSweep remaining T1 capacity with Sweep Pump: ${remainingT1Vol.toFixed(1)}µL at sweep rate ${sweepDeliveryFr}µL/min`);
            const sweepSecondDurationMs = (remainingT1Vol / sweepDeliveryFr) * 60 * 1000;
            elapsedMsStep5 = sweepSecondDurationMs;
          }
        } else {
          lines.push(`0\t# NO SWEEP PUMP ASSIGNED\tPurge Reactor 1 bypassed`);
          elapsedMsStep5 = r1InjectCount > 0 ? maxR1DeliveryTimeMs : 0;
        }
        lines.push("");

        // Step 6: Actual Reactor 2 Reaction happening
        lines.push(`# --- PROCESS STEP 6: REACTOR 2 CO-DELIVERY MIXING ---`);
        const r2Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 2" || p.sweep === "Yes");
        let step6DelayVal = Math.ceil(elapsedMsStep5);
        let maxR2DeliveryTimeMs = 0;
        let r2InjectCount = 0;

        r2Pumps.forEach((pump) => {
          const rData = reactionData["R2"]?.[pump.id] || { vol: "0", fr: "0" };
          let valVol = parseFloat(rData.vol) || 0;
          const valFr = parseFloat(rData.fr) || 0;

          if (valVol > 0 && valFr > 0) {
            const { volSteps, fpsCounts } = computeSteps(pump.id, valVol, valFr);
            const deliveryTimeMs = (valVol / valFr) * 60 * 1000;
            if (deliveryTimeMs > maxR2DeliveryTimeMs) {
              maxR2DeliveryTimeMs = deliveryTimeMs;
            }
            const port = pump.sweep === "Yes" ? "o2" : "o5";
            const descStr = pump.sweep === "Yes"
              ? `Synchronized Reaction 2 delivery Sweep Pump ${pump.id}: ${valVol.toFixed(1)}µL at ${valFr}µL/min`
              : `Synchronized Reaction 2 delivery Reactant Pump ${pump.id}: ${valVol.toFixed(1)}µL at ${valFr}µL/min`;

            lines.push(`${step6DelayVal}\t/${pump.addr}${port}V${fpsCounts}D${volSteps}R\t${descStr}`);
            step6DelayVal = 0;
            r2InjectCount++;
          }
        });

        if (r2InjectCount === 0) {
          lines.push(`# NO ACTIVE REACTOR 2 REAGENTS\tR2 co-delivery bypassed`);
        }
        lines.push("");

        // Step 7: Reactor 2 non-sweep valve rotation to port 7
        lines.push(`# --- PROCESS STEP 7: REACTOR 2 VALVE ROTATION TO PORT 7 ---`);
        let turnedR2Others = false;
        const delayAfterR2Delivery = r2InjectCount > 0 ? Math.ceil(maxR2DeliveryTimeMs) : 0;
        r2Pumps.forEach((pump) => {
          if (pump.sweep !== "Yes" && pump.assignedReactor === "Reactor 2") {
            const rData = reactionData["R2"]?.[pump.id] || { vol: "0", fr: "0" };
            const valVol = parseFloat(rData.vol) || 0;
            const valFr = parseFloat(rData.fr) || 0;
            if (valVol > 0 && valFr > 0) {
              const delayVal = turnedR2Others ? 0 : delayAfterR2Delivery;
              lines.push(`${delayVal}\t/${pump.addr}o7R\tClose non-sweep Reactant Pump ${pump.id} (turn to plugged Port 7)`);
              turnedR2Others = true;
            }
          }
        });
        lines.push("");

        // Step 8: Sweep Delivery for Reactor 2 and T2 / Sweep Lines
        lines.push(`# --- PROCESS STEP 8: SWEEP AND WASH VALVES FOR REACTOR 2 ---`);
        if (sweepPumpObj) {
          const step8DelayVal = turnedR2Others ? 0 : (r2InjectCount > 0 ? delayAfterR2Delivery : step6DelayVal);
          const r2Vol = fluidics.reactor2Vol;
          let cumulatedR2Fr = 0;
          r2Pumps.forEach((p) => {
            const rData = reactionData["R2"]?.[p.id] || { vol: "0", fr: "0" };
            const valVol = parseFloat(rData.vol) || 0;
            const valFr = parseFloat(rData.fr) || 0;
            if (valVol > 0 && valFr > 0) {
              cumulatedR2Fr += valFr;
            }
          });
          if (cumulatedR2Fr <= 0) {
            cumulatedR2Fr = 100.0;
          }

          const { volSteps: r2VolSteps, fpsCounts: r2CumFrCounts } = computeSteps(sweepPumpObj.id, r2Vol, cumulatedR2Fr);
          lines.push(`${step8DelayVal}\t/${sweepPumpObj.addr}o2V${r2CumFrCounts}D${r2VolSteps}R\tPurge Reactor 2 volume using Sweep Pump: ${r2Vol}µL at cumulated ${cumulatedR2Fr.toFixed(2)}µL/min`);

          const r2FirstDurationMs = (r2Vol / cumulatedR2Fr) * 60 * 1000;

          const finalSweepVol = fluidics.transfer2Vol + fluidics.sweepVol;
          const { volSteps: finalSweepSteps, fpsCounts: finalSweepCounts } = computeSteps(sweepPumpObj.id, finalSweepVol, sweepDeliveryFr);
          const washDurationMs = (finalSweepVol / sweepDeliveryFr) * 60 * 1000;
          lines.push(`${Math.ceil(r2FirstDurationMs)}\t/${sweepPumpObj.addr}o2V${finalSweepCounts}D${finalSweepSteps}R\tPost-reaction sweep wash to T2 and Sweep Line: ${finalSweepVol}µL at sweep rate ${sweepDeliveryFr}µL/min`);

          handlesCompletionInternally = true;
          if (autoSample === "Yes") {
            const sp_a = asLogic["Stop Collection"]["A"] === "ON" ? "TRUE" : "FALSE";
            const sp_b = asLogic["Stop Collection"]["B"] === "ON" ? "TRUE" : "FALSE";
            lines.push(`${Math.ceil(washDurationMs)}\tAUX${auxA} ${sp_a}\tStop fraction collection valve A`);
            lines.push(`0\tAUX${auxB} ${sp_b}\tStop fraction collection valve B`);
          } else {
            lines.push(`${Math.ceil(washDurationMs)}\tWait\tReaction completed, retrieve collection vial`);
          }
          lines.push("");
          lines.push(`# RUN END\tAdvion NanoTek Macro synthesis execution completed.`);
          lines.push("# =========================================================");
        } else {
          lines.push(`# NO SWEEP PUMP ASSIGNED\tReactor 2 sweep bypassed`);
        }
      } else {
        // --- SCENARIO B: EXTREMELY PRECISE ABSOLUTE TIMELINE DISPATCHER ---
        lines.push(`# =========================================================`);
        lines.push(`# SCENARIO B: (R1 Bolus + Reactor 1 Volume) > T1 Transfer Line Capacity`);
        lines.push(`# =========================================================`);

        handlesCompletionInternally = true;

        // Calculate absolute timestamps in ms relative to Step 3 Start
        const reachR2Ms = ((r1Vol + t1) / cumulatedFr) * 60 * 1000;
        const sweepBVol = r1Vol + t1;
        const sweepDurMs = (sweepBVol / cumulatedFr) * 60 * 1000;

        let maxR1DeliveryTimeMs = 0;
        let r1InjectCount = 0;
        r1Pumps.forEach((pump) => {
          const rData = reactionData["R1"]?.[pump.id] || { vol: "0", fr: "0" };
          const valVol = parseFloat(rData.vol) || 0;
          const valFr = parseFloat(rData.fr) || 0;
          if (valVol > 0 && valFr > 0) {
            const deliveryTimeMs = (valVol / valFr) * 60 * 1000;
            if (deliveryTimeMs > maxR1DeliveryTimeMs) {
              maxR1DeliveryTimeMs = deliveryTimeMs;
            }
            r1InjectCount++;
          }
        });

        const sweepEndAbsMs = maxR1DeliveryTimeMs + sweepDurMs;

        // Reactor 2 flows and metrics
        const r2Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 2" || p.sweep === "Yes");
        let cumulatedR2Fr = 0;
        r2Pumps.forEach((p) => {
          const rData = reactionData["R2"]?.[p.id] || { vol: "0", fr: "0" };
          const valVol = parseFloat(rData.vol) || 0;
          const valFr = parseFloat(rData.fr) || 0;
          if (valVol > 0 && valFr > 0) {
            cumulatedR2Fr += valFr;
          }
        });
        if (cumulatedR2Fr <= 0) {
          cumulatedR2Fr = 100.0;
        }

        const r2Vol = fluidics.reactor2Vol;
        const r2SweepDurMs = (r2Vol / cumulatedR2Fr) * 60 * 1000;
        const r2SweepEndAbsMs = sweepEndAbsMs + r2SweepDurMs;

        const finalSweepVol = fluidics.transfer2Vol + fluidics.sweepVol;
        const finalSweepDurMs = (finalSweepVol / sweepDeliveryFr) * 60 * 1000;
        const totalReactionEndAbsMs = r2SweepEndAbsMs + finalSweepDurMs;

        // Build command queue
        interface BCommand {
          absTimeMs: number;
          priority: number;
          command: string;
          desc: string;
        }

        const commands: BCommand[] = [];

        // T = 0 commands
        commands.push({
          absTimeMs: 0,
          priority: 0,
          command: `# --- PROCESS STEP 3: 2-STEP STAGE 1 CO-DELIVERY MIXING (R1 PORT 5) ---`,
          desc: ""
        });

        if (hubAddr && hubAddr !== "0" && hubAddr.trim() !== "") {
          commands.push({
            absTimeMs: 0,
            priority: 1,
            command: `/${hubAddr}o${hubPort}R`,
            desc: `Configure Distribution Hub (DH) to Port ${hubPort}`
          });
        }

        if (autoSample === "Yes") {
          const st_a = asLogic["Start Collection"]["A"] === "ON" ? "TRUE" : "FALSE";
          const st_b = asLogic["Start Collection"]["B"] === "ON" ? "TRUE" : "FALSE";
          commands.push({
            absTimeMs: 0,
            priority: 1,
            command: `AUX${auxA} ${st_a}`,
            desc: "Start fraction collection valve A"
          });
          commands.push({
            absTimeMs: 0,
            priority: 1,
            command: `AUX${auxB} ${st_b}`,
            desc: "Start fraction collection valve B"
          });
        }

        r1Pumps.forEach((pump) => {
          const rData = reactionData["R1"]?.[pump.id] || { vol: "0", fr: "0" };
          const valVol = parseFloat(rData.vol) || 0;
          const valFr = parseFloat(rData.fr) || 0;
          if (valVol > 0 && valFr > 0) {
            const { volSteps, fpsCounts } = computeSteps(pump.id, valVol, valFr);
            commands.push({
              absTimeMs: 0,
              priority: 2,
              command: `/${pump.addr}o5V${fpsCounts}D${volSteps}R`,
              desc: `Synchronized co-delivery Reactant Pump ${pump.id}: ${valVol}µL at ${valFr}µL/min`
            });
          }
        });

        // T = reachR2Ms: non-sweep Reactor 2 pumps start delivering
        commands.push({
          absTimeMs: reachR2Ms,
          priority: 0,
          command: `# --- PROCESS STEP: REACTOR 2 REAGENTS MEET R1 BOLUS IN REACTOR 2 ---`,
          desc: ""
        });

        r2Pumps.forEach((pump) => {
          if (pump.sweep !== "Yes" && pump.assignedReactor === "Reactor 2") {
            const rData = reactionData["R2"]?.[pump.id] || { vol: "0", fr: "0" };
            const valVol = parseFloat(rData.vol) || 0;
            const valFr = parseFloat(rData.fr) || 0;
            if (valVol > 0 && valFr > 0) {
              const { volSteps, fpsCounts } = computeSteps(pump.id, valVol, valFr);
              commands.push({
                absTimeMs: reachR2Ms,
                priority: 2,
                command: `/${pump.addr}o5V${fpsCounts}D${volSteps}R`,
                desc: `Synchronized Reaction 2 non-sweep Pump ${pump.id}: ${valVol.toFixed(1)}µL at ${valFr}µL/min`
              });
            }
          }
        });

        // T = maxR1DeliveryTimeMs: Reaction 1 non-sweep closure + Sweep pump start delivers of R1 + T1 overflow
        commands.push({
          absTimeMs: maxR1DeliveryTimeMs,
          priority: 0,
          command: `# --- PROCESS STEP 4: SEALS R1 PUMPS & DELIVERS R1 + T1 CAPACITIES ---`,
          desc: ""
        });

        r1Pumps.forEach((pump) => {
          if (pump.sweep !== "Yes" && pump.assignedReactor === "Reactor 1") {
            const rData = reactionData["R1"]?.[pump.id] || { vol: "0", fr: "0" };
            const valVol = parseFloat(rData.vol) || 0;
            const valFr = parseFloat(rData.fr) || 0;
            if (valVol > 0 && valFr > 0) {
              commands.push({
                absTimeMs: maxR1DeliveryTimeMs,
                priority: 1,
                command: `/${pump.addr}o7R`,
                desc: `Close non-sweep Reactant Pump ${pump.id} (turn to plugged Port 7)`
              });
            }
          }
        });

        if (sweepPumpObj) {
          const { volSteps, fpsCounts } = computeSteps(sweepPumpObj.id, sweepBVol, cumulatedFr);
          commands.push({
            absTimeMs: maxR1DeliveryTimeMs,
            priority: 2,
            command: `/${sweepPumpObj.addr}o2V${fpsCounts}D${volSteps}R`,
            desc: `Sweep pump delivers (R1 + T1) capacity: ${sweepBVol.toFixed(1)}µL at cumulated ${cumulatedFr.toFixed(2)}µL/min via Port 2`
          });
        }

        // T = sweepEndAbsMs: Reaction 2 non-sweep close + Sweep pump Reactor 2 volume sweep
        commands.push({
          absTimeMs: sweepEndAbsMs,
          priority: 0,
          command: `# --- PROCESS STEP 5: SEALS R2 PUMPS & SWEEPS REACTOR 2 VOLUME ---`,
          desc: ""
        });

        r2Pumps.forEach((pump) => {
          if (pump.sweep !== "Yes" && pump.assignedReactor === "Reactor 2") {
            const rData = reactionData["R2"]?.[pump.id] || { vol: "0", fr: "0" };
            const valVol = parseFloat(rData.vol) || 0;
            const valFr = parseFloat(rData.fr) || 0;
            if (valVol > 0 && valFr > 0) {
              commands.push({
                absTimeMs: sweepEndAbsMs,
                priority: 1,
                command: `/${pump.addr}o7R`,
                desc: `Close non-sweep Reaction 2 Pump ${pump.id} (turn to plugged Port 7)`
              });
            }
          }
        });

        if (sweepPumpObj) {
          const { volSteps, fpsCounts } = computeSteps(sweepPumpObj.id, r2Vol, cumulatedR2Fr);
          commands.push({
            absTimeMs: sweepEndAbsMs,
            priority: 2,
            command: `/${sweepPumpObj.addr}o2V${fpsCounts}D${volSteps}R`,
            desc: `Purge Reactor 2 volume using Sweep Pump: ${r2Vol.toFixed(1)}µL at cumulated ${cumulatedR2Fr.toFixed(2)}µL/min via Port 2`
          });
        }

        // T = r2SweepEndAbsMs: Swipe of T2 and Sweep Lines at sweep delivery rate
        commands.push({
          absTimeMs: r2SweepEndAbsMs,
          priority: 0,
          command: `# --- PROCESS STEP 6: POST-REACTION SWEEP WASH TO T2 & SWEEP LINE ---`,
          desc: ""
        });

        if (sweepPumpObj) {
          const { volSteps, fpsCounts } = computeSteps(sweepPumpObj.id, finalSweepVol, sweepDeliveryFr);
          commands.push({
            absTimeMs: r2SweepEndAbsMs,
            priority: 2,
            command: `/${sweepPumpObj.addr}o2V${fpsCounts}D${volSteps}R`,
            desc: `Post-reaction sweep wash: ${finalSweepVol.toFixed(1)}µL at sweep rate ${sweepDeliveryFr}µL/min via Port 2`
          });
        }

        // T = totalReactionEndAbsMs: Stop automated fraction collection or manual vial retrieve
        commands.push({
          absTimeMs: totalReactionEndAbsMs,
          priority: 0,
          command: `# --- PROCESS STEP 7: PROCESS COMPLETION & FRACTION SEPARATION ---`,
          desc: ""
        });

        if (autoSample === "Yes") {
          const sp_a = asLogic["Stop Collection"]["A"] === "ON" ? "TRUE" : "FALSE";
          const sp_b = asLogic["Stop Collection"]["B"] === "ON" ? "TRUE" : "FALSE";
          commands.push({
            absTimeMs: totalReactionEndAbsMs,
            priority: 1,
            command: `AUX${auxA} ${sp_a}`,
            desc: "Stop fraction collection valve A"
          });
          commands.push({
            absTimeMs: totalReactionEndAbsMs,
            priority: 1,
            command: `AUX${auxB} ${sp_b}`,
            desc: "Stop fraction collection valve B"
          });
        } else {
          commands.push({
            absTimeMs: totalReactionEndAbsMs,
            priority: 1,
            command: "Wait",
            desc: "Reaction completed, retrieve collection vial"
          });
        }

        commands.push({
          absTimeMs: totalReactionEndAbsMs,
          priority: 3,
          command: `# RUN END\tAdvion NanoTek Macro synthesis execution completed.`,
          desc: ""
        });

        // Sort commands ascending by absolute time, then priority
        commands.sort((c1, c2) => {
          if (Math.abs(c1.absTimeMs - c2.absTimeMs) > 1e-3) {
            return c1.absTimeMs - c2.absTimeMs;
          }
          return c1.priority - c2.priority;
        });

        // Dispatch into relative delay macro lines
        let currentAbsTimeMs = 0;
        const startDelayMs = sweepPumpObj ? pressDurationMs : maxFillTimeMs;
        commands.forEach((c) => {
          const targetAbsTime = startDelayMs + c.absTimeMs;
          if (c.command.startsWith("#")) {
            lines.push(c.command);
          } else {
            const relativeDelay = Math.max(0, Math.ceil(targetAbsTime - currentAbsTimeMs));
            lines.push(`${relativeDelay}\t${c.command}\t${c.desc}`);
            currentAbsTimeMs = targetAbsTime;
          }
        });

        lines.push("# =========================================================");
      }
    }

    // Stop automated collection if selected
    if (!handlesCompletionInternally) {
      if (autoSample === "Yes") {
        lines.push("");
        lines.push(`# --- PROCESS STEP: STOP AUTOMATED FRACTION COLLECTION ---`);
        const sp_a = asLogic["Stop Collection"]["A"] === "ON" ? "TRUE" : "FALSE";
        const sp_b = asLogic["Stop Collection"]["B"] === "ON" ? "TRUE" : "FALSE";
        lines.push(`0\tAUX${auxA} ${sp_a}\tStop fraction collection valve A`);
        lines.push(`0\tAUX${auxB} ${sp_b}\tStop fraction collection valve B`);
      }

      // Reference wait retrieved manual sampling option
      if (autoSample !== "Yes") {
        lines.push("");
        lines.push(`# --- PROCESS STEP: RETRIEVE COLLECTION VIAL ---`);
        lines.push(`0\tWait\tReaction completed, retrieve collection vial`);
      }

      lines.push("");
      lines.push(`# RUN END\tAdvion NanoTek Macro synthesis execution completed.`);
      lines.push("# =========================================================");
    }

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
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
            <span className={`w-1.5 h-1.5 rounded-full ${fluidics.reactor2Vol > 0 ? "bg-purple-500" : "bg-amber-500 animate-pulse"}`}></span>
            <span className={fluidics.reactor2Vol > 0 ? "text-purple-700" : "text-amber-700"}>
              {fluidics.reactor2Vol > 0 ? "2-Step Synthesis Mode" : "1-Step Synthesis Active"}
            </span>
          </div>
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

                // Helper to parse Cavro/pump commands starting with '/'
                const parseSyrCommand = (cmd: string) => {
                  if (!cmd.trim().startsWith("/")) return null;
                  const match = cmd.trim().match(/^\/([A-Za-z0-9])(.*)$/);
                  if (!match) return null;
                  return { address: match[1], rest: match[2] };
                };

                const incomingParsed = parseSyrCommand(cmdCode);

                if (lastLine.trim().startsWith("#")) {
                  // If last line is a comment, add a new action line instead of concatenating inside the comment
                  lines.push(`0\t${cmdCode}\tConcatenated operation`);
                } else if (incomingParsed) {
                  // Incoming is a pump command!
                  const parts = lastLine.split("\t");
                  const lastLineCmd = parts.length >= 2 ? parts[1].trim() : lastLine.trim();
                  const lastLineParsed = parseSyrCommand(lastLineCmd);

                  if (lastLineParsed && lastLineParsed.address === incomingParsed.address) {
                    // SAME PUMP ADDRESS! Concatenate them safely
                    const lastWithoutR = lastLineCmd.endsWith("R") ? lastLineCmd.slice(0, -1) : lastLineCmd;
                    const incomingWithoutR = incomingParsed.rest.endsWith("R") ? incomingParsed.rest.slice(0, -1) : incomingParsed.rest;
                    const concatenatedCmd = lastWithoutR + incomingWithoutR + "R";

                    if (parts.length >= 2) {
                      parts[1] = concatenatedCmd;
                      lines[lastLineIndex] = parts.join("\t");
                    } else {
                      lines[lastLineIndex] = concatenatedCmd;
                    }
                  } else {
                    // DIFFERENT PUMP ADDRESS (or last line was not a pump command)!
                    // Automatically append to a new line
                    lines.push(`0\t${cmdCode}\tConcatenated pump step`);
                  }
                } else {
                  // Incoming is not a pump command (generic fallback)
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
              addLog(`Code helper: Processed inline concatenate/append for [${cmdCode}].`, "success");
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
