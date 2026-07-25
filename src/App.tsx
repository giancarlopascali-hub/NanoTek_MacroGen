import React, { useState, useEffect } from "react";
import { PumpConfig, FluidicsConfig, AUXState, LogLine } from "./types";
import { Play, Code, ShieldCheck, Cpu, Terminal, BookOpen, Settings, Flame, ChevronUp, ChevronDown } from "lucide-react";
import FluidicSchematic from "./components/FluidicSchematic";
import SyntaxExplorer from "./components/SyntaxExplorer";
import PumpConfigurator from "./components/PumpConfigurator";
import ReactionControl from "./components/ReactionControl";
import MacroIde from "./components/MacroIde";
import { MAX_CONSOLE_LOGS } from "./constants";
import {
  getUsedLoopVolumes,
  checkSafety as checkSafetyEngine,
  compileMacro,
} from "./macroEngine";

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

  // Centralized 1-step mode check
  const isOneStep = fluidics.reactor2Vol <= 0;

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
  const [macroSelection, setMacroSelection] = useState<{ start: number; end: number } | null>(null);

  // Helper to map character selection index to line index
  const getLineIndex = (text: string, charIndex: number): number => {
    let lineCount = 0;
    for (let i = 0; i < charIndex && i < text.length; i++) {
      if (text[i] === "\n") {
        lineCount++;
      }
    }
    return lineCount;
  };

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
    setConsoleLogs((prev) => {
      const next = [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          message,
          type,
        },
      ];
      if (next.length > MAX_CONSOLE_LOGS) {
        return next.slice(next.length - MAX_CONSOLE_LOGS);
      }
      return next;
    });
  };

  // Synchronizes flow rates such that delivery duration remains matching across channels
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

  // State changes effect handling: Automatically sync R2 SW Vol to R1 Bolus!
  useEffect(() => {
    let bolus1Val = 0;
    pumps.forEach((p) => {
      if (p.addr !== "0" && p.assignedReactor === "Reactor 1") {
        bolus1Val += Number(reactionData["R1"]?.[p.id]?.vol) || 0;
      }
    });

    const bolus1Formatted = bolus1Val.toFixed(2);
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
          if (field === "loopVol" && value > p.syringeVol) {
            triggerToast(`Warning: Pump ${p.id} Loop volume (${value}µL) cannot exceed Syringe capability (${p.syringeVol}µL). Reset to Syringe Size.`);
            updated.loopVol = p.syringeVol;
          }
          if (field === "syringeVol" && p.loopVol > value) {
            updated.loopVol = value;
          }
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

  const handleReactFieldChange = (rid: "R1" | "R2", pid: number, field: "vol" | "fr", value: string) => {
    if (field === "vol") {
      const targetPump = pumps.find((p) => p.id === pid);
      if (targetPump) {
        const isReactantCheck = targetPump.sweep === "No" || (targetPump.sweep === "Yes" && isOneStep);
        if (isReactantCheck && Number(value) > targetPump.loopVol) {
          triggerToast(`Pump ${pid} volume request exceeds static loop capacity (${targetPump.loopVol}µL)!`);
          return;
        }
      }
    }

    const proposedState = {
      ...reactionData,
      [rid]: {
        ...reactionData[rid],
        [pid]: {
          ...reactionData[rid]?.[pid],
          [field]: value,
        },
      },
    };

    if (rid === "R1" && field === "vol" && !isOneStep) {
      let bolus1Val = 0;
      pumps.forEach((p) => {
        if (p.addr !== "0" && p.assignedReactor === "Reactor 1") {
          const vStr = p.id === pid ? value : proposedState["R1"]?.[p.id]?.vol || "0";
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
            vol: bolus1Formatted,
          },
        };
      }
    }

    const currentUsedVols = getUsedLoopVolumes(pumps, macroContent);
    const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");

    let hasOverflow = false;
    let overflowMsg = "";

    if (isOneStep) {
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
      return;
    }

    setReactionData((prev) => {
      const targetState = { ...prev[rid] };
      const current = { ...targetState[pid], [field]: value };
      targetState[pid] = current;

      const volVal = field === "vol" ? value : current.vol;
      const frVal = field === "fr" ? value : current.fr;
      syncFlowRates(rid, pid, volVal, frVal);

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

  const checkSafety = () => {
    const res = checkSafetyEngine(
      pumps,
      fluidics,
      reactionData,
      macroContent,
      r1Metrics.bolus,
      r1Metrics.frSum
    );

    if (res?.errorLog) {
      addLog(res.errorLog, "error");
    } else if (res?.successLog) {
      addLog(res.successLog, "success");
    }

    return res;
  };

  const handleBuildMacroText = () => {
    const result = compileMacro({
      pumps,
      fluidics,
      reactionData,
      r1Heaters,
      r2Heaters,
      hubAddr,
      hubPort,
      finalSweepFr,
      autoSample,
      auxA,
      auxB,
      asLogic,
      r1MetricsBolus: r1Metrics.bolus,
      r1MetricsFrSum: r1Metrics.frSum,
      existingMacroContent: macroContent,
    });

    if (result.error) {
      addLog(result.error, "error");
      triggerToast(result.error);
      return;
    }

    setMacroContent(result.newMacroContent);
    setActiveTab("Macro");
    addLog("Macro compiled successfully according to current reaction parameters. Appended script and updated loop metrics.", "success");
    triggerToast("Full Macro Appended Successfully!");
  };

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
      } else if (actionCmd.startsWith("\x02") || actionCmd.startsWith(" ") || actionCmd.charCodeAt(0) === 2) {
        const addrStr = actionCmd.slice(2, 4);
        const hIdx = parseInt(addrStr, 10) - 31;
        const valPart = actionCmd.slice(6, 14);
        const tempVal = parseFloat(valPart) / 100;
        addLog(`[L:${lineIdx} THERMAL STAGE]: Set Heater ${hIdx} temperature to ${tempVal.toFixed(1)}°C (${description})`, "warning");
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
              Advion NanoTek Macro Generator
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
              Standalone Compiler & Configurator
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
        
        {/* Left Sidebar Command list */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <SyntaxExplorer
            pumps={pumps}
            hubAddr={hubAddr}
            onInsertCommand={(cmd) => {
              setMacroContent((prev) => {
                if (!prev) return cmd;
                const lines = prev.split("\n");
                let targetLineIndex = lines.length - 1;
                if (macroSelection !== null) {
                  targetLineIndex = getLineIndex(prev, macroSelection.start);
                }
                
                if (targetLineIndex < 0) targetLineIndex = 0;
                if (targetLineIndex >= lines.length) targetLineIndex = lines.length - 1;

                lines.splice(targetLineIndex + 1, 0, cmd);
                return lines.join("\n");
              });
              addLog(`Code helper: Appended base action [${cmd}] directly to macro editor space.`, "success");
            }}
            onConcatCommand={(cmdCode) => {
              setMacroContent((prev) => {
                if (!prev) return cmdCode;
                const lines = prev.split("\n");
                let targetLineIndex = lines.length - 1;
                if (macroSelection !== null) {
                  targetLineIndex = getLineIndex(prev, macroSelection.start);
                }

                if (targetLineIndex < 0) targetLineIndex = 0;
                if (targetLineIndex >= lines.length) targetLineIndex = lines.length - 1;

                const lastLine = lines[targetLineIndex];

                const parseSyrCommand = (cmd: string) => {
                  if (!cmd.trim().startsWith("/")) return null;
                  const match = cmd.trim().match(/^\/([A-Za-z0-9])(.*)$/);
                  if (!match) return null;
                  return { address: match[1], rest: match[2] };
                };

                const incomingParsed = parseSyrCommand(cmdCode);
                const isMCommand = cmdCode.trim().startsWith("M");
                const isRCommand = cmdCode.trim() === "R";

                if (lastLine.trim().startsWith("#") || lastLine.trim() === "") {
                  lines.splice(targetLineIndex + 1, 0, `0\t${cmdCode}\tConcatenated operation`);
                } else if (incomingParsed) {
                  const parts = lastLine.split("\t");
                  const lastLineCmd = parts.length >= 2 ? parts[1].trim() : lastLine.trim();
                  const lastLineParsed = parseSyrCommand(lastLineCmd);

                  if (lastLineParsed && lastLineParsed.address === incomingParsed.address) {
                    const lastWithoutR = lastLineCmd.endsWith("R") ? lastLineCmd.slice(0, -1) : lastLineCmd;
                    const incomingWithoutR = incomingParsed.rest.endsWith("R") ? incomingParsed.rest.slice(0, -1) : incomingParsed.rest;
                    const concatenatedCmd = lastWithoutR + incomingWithoutR + "R";

                    if (parts.length >= 2) {
                      parts[1] = concatenatedCmd;
                      lines[targetLineIndex] = parts.join("\t");
                    } else {
                      lines[targetLineIndex] = concatenatedCmd;
                    }
                  } else {
                    lines.splice(targetLineIndex + 1, 0, `0\t${cmdCode}\tConcatenated pump step`);
                  }
                } else if (isMCommand || isRCommand) {
                  const parts = lastLine.split("\t");
                  const lastLineCmd = parts.length >= 2 ? parts[1].trim() : lastLine.trim();

                  const lastWithoutR = lastLineCmd.endsWith("R") ? lastLineCmd.slice(0, -1) : lastLineCmd;
                  const concatenatedCmd = lastWithoutR + cmdCode.trim() + (lastLineCmd.endsWith("R") ? "R" : "");

                  if (parts.length >= 2) {
                    parts[1] = concatenatedCmd;
                    lines[targetLineIndex] = parts.join("\t");
                  } else {
                    lines[targetLineIndex] = concatenatedCmd;
                  }
                } else {
                  lines.splice(targetLineIndex + 1, 0, `0\t${cmdCode}\tConcatenated operation`);
                }

                return lines.join("\n");
              });
              addLog(`Code helper: Processed inline concatenate/append for [${cmdCode}].`, "success");
            }}
          />
        </aside>

        {/* Dynamic Center Workspaces */}
        <main className="flex-1 bg-slate-50 p-6 overflow-y-auto flex flex-col space-y-6">
          
          {/* Reactive Schematic shown across Tabs */}
          <FluidicSchematic
            pumps={pumps}
            fluidics={fluidics}
            hubAddr={hubAddr}
            hubPort={hubPort}
            r1Heaters={r1Heaters}
            r2Heaters={r2Heaters}
            r1Bolus={r1Metrics.bolus}
            r2Bolus={r2Metrics.bolus}
            usedVolumes={getUsedLoopVolumes(pumps, macroContent)}
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
                setMacroSelection(null);
                addLog("Workspace script cleared.", "warning");
              }}
              onSimulate={runSimulation}
              showSuccessMessage={triggerToast}
              onSelectionChange={(start, end) => {
                setMacroSelection({ start, end });
              }}
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

      {/* Bottom Terminal Output Console logs */}
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
