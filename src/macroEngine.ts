/**
 * Core microfluidic macro engine for Advion NanoTek standalone synthesis compiler.
 * Contains pure domain calculations, safety audit checks, loop capacity tracking,
 * and macro block generation without React state dependencies.
 */

import { PumpConfig, FluidicsConfig, AUXState, BCommand } from "./types";
import { formatHeaterCommand, formatPumpCommand } from "./utils";
import {
  FILL_SPEED_COUNTS,
  PRESSURIZE_VOL_UL,
  PRESSURIZE_FR_UL_MIN,
  PRESSURIZE_DURATION_MS,
  HEATER_WAIT_MS,
  FLOW_RATE_TOLERANCE,
  DEFAULT_SWEEP_FR,
  DEFAULT_CUMULATED_FR,
  AUX_IDLE_DELAY_MS,
} from "./constants";

/**
 * Calculates step count (G command parameter) and speed velocity count (V command parameter)
 * for a syringe pump based on syringe capacity and step resolution.
 */
export function computeSteps(
  pump: PumpConfig | undefined,
  volumeUl: number,
  rateUlMin: number
): { volSteps: number; fpsCounts: number } {
  if (!pump || pump.syringeVol <= 0) return { volSteps: 0, fpsCounts: 0 };

  const syrSize = pump.syringeVol;
  const maxSteps = pump.steps;

  // Volume Steps: (Vol / Syringe) * resolution
  const volSteps = Math.floor((volumeUl / syrSize) * maxSteps);

  // Rate / Velocity Counts (V): (rate_sec / Syringe) * resolution
  const fpsCounts = Math.floor(((rateUlMin / 60.0) / syrSize) * maxSteps);

  return { volSteps, fpsCounts };
}

/**
 * Parses macro text to compute total volume dispensed per pump through Port 5 (reactor channel).
 */
export function getUsedLoopVolumes(
  pumps: PumpConfig[],
  macro: string
): Record<number, number> {
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
        // Only account for volume sent via port 5 (i.e. reactor channel)
        if (pumpObj && actionCmd.includes("o5")) {
          let steps = 0;
          const gMatch = actionCmd.match(/G(\d+)/);
          if (gMatch) {
            steps = parseInt(gMatch[1], 10);
          } else {
            const dMatch = actionCmd.match(/D(\d+)/);
            if (dMatch) {
              steps = parseInt(dMatch[1], 10);
            }
          }
          if (steps > 0 && pumpObj.steps > 0) {
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
}

/**
 * Generates the comment block summarizing remaining loop capacity for active pumps.
 */
export function makeMetricsBlock(
  pumps: PumpConfig[],
  usedVols: Record<number, number>
): string {
  let block = "\t\t\t# --- WORKSPACE LOOP CAPACITY TRACKING METRICS ---\n";
  const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");
  activePumps.forEach((p) => {
    const used = usedVols[p.id] || 0;
    const cap = p.loopVol;
    const left = Math.max(0, cap - used);
    block += `\t\t\t#   - Pump ${p.id} (${p.assignedReactor}${
      p.sweep === "Yes" ? " Sweep" : " Reagent"
    }): ${used.toFixed(1)} µL used of ${cap} µL capacity (${left.toFixed(1)} µL left)\n`;
  });
  block += "\t\t\t# =========================================================";
  return block;
}

/**
 * Removes previous capacity metrics comments from a macro string before appending new ones.
 */
export function cleanOldMetrics(text: string): string {
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
        inMetricsBlock = false;
        continue;
      }
      continue;
    }
    cleanedLines.push(line);
  }
  return cleanedLines.join("\n").trim();
}

/**
 * Performs a comprehensive safety audit checking loop capacity leftovers,
 * fluidic line limits, and flow rate balance between R1 and R2 channels.
 */
export function checkSafety(
  pumps: PumpConfig[],
  fluidics: FluidicsConfig,
  reactionData: Record<string, Record<number, { vol: string; fr: string }>>,
  macroContent: string,
  r1MetricsBolus: string,
  r1MetricsFrSum: string
): { safe: boolean; msg: string; errorLog?: string; successLog?: string } | null {
  try {
    const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");
    const isOneStep = fluidics.reactor2Vol <= 0;
    const currentUsedVols = getUsedLoopVolumes(pumps, macroContent);

    if (isOneStep) {
      // 1-STEP CASE SAFETY AUDIT
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
        const msg = `1-Step Loop Capacity overflow on Pump P${loopOverflowPumpId}! Requested ${loopOverflowVol.toFixed(
          1
        )} µL but only ${leftoverVol.toFixed(1)} µL is left in the loop.`;
        return {
          safe: false,
          msg,
          errorLog: `Safety Audit Failed: Proposed Reactant volume for Pump P${loopOverflowPumpId} (${loopOverflowVol.toFixed(
            1
          )} µL) exceeds remaining loop capacity leftover (${leftoverVol.toFixed(1)} µL).`,
        };
      }

      return {
        safe: true,
        msg: "All 1-Step microfluidic loops are balanced and safe for compilation.",
        successLog: "Safety Audit check: 1-Step microfluidic loops are within safe capacity bounds.",
      };
    } else {
      // 2-STEP CASE SAFETY AUDIT
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
        const msg = `2-Step Loop Capacity overflow on Pump P${loopOverflowPumpId}! Total requested (Stage 1 + Stage 2) is ${loopOverflowVol.toFixed(
          1
        )} µL but only ${leftoverVol.toFixed(1)} µL is left in the loop.`;
        return {
          safe: false,
          msg,
          errorLog: `Safety Audit Failed: Total planned volume for Pump P${loopOverflowPumpId} (${loopOverflowVol.toFixed(
            1
          )} µL) exceeds remaining loop capacity leftover (${leftoverVol.toFixed(1)} µL).`,
        };
      }

      // Bolus / Sweep match check for 2-Step
      const b1 = parseFloat(r1MetricsBolus) || 0;
      const t1 = fluidics.transfer1Vol;
      const r1Vol = fluidics.reactor1Vol;
      const f1_sum = parseFloat(r1MetricsFrSum) || 0;

      const swPumpObj = pumps.find((p) => p.addr !== "0" && p.sweep === "Yes");
      const sw_fr = swPumpObj ? parseFloat(reactionData["R2"]?.[swPumpObj.id]?.fr || "0.00") || 0 : 0;

      if (t1 < b1 + r1Vol) {
        if (Math.abs(f1_sum - sw_fr) > FLOW_RATE_TOLERANCE) {
          const msg = `Transfer line 1 capacity (${t1} µL) is smaller than R1 bolus + Reactor 1 volume (${(
            b1 + r1Vol
          ).toFixed(1)} µL). R1 cumulated flow rate (${f1_sum} µL/min) must match the R2 sweep channel rate (${sw_fr} µL/min).`;
          return {
            safe: false,
            msg,
            errorLog: `Safety Audit Failed: Transfer line 1 capacity (${t1} µL) is smaller than R1 bolus + Reactor 1 volume (${(
              b1 + r1Vol
            ).toFixed(
              1
            )} µL). R1 flow rate sum (${f1_sum} µL/min) must match the sweep channel flow rate (${sw_fr} µL/min) perfectly to prevent mixing errors!`,
          };
        }
      }

      return {
        safe: true,
        msg: "All 2-Step microfluidic loops, flows, and heaters are safe for compilation.",
        successLog: "Safety Audit check: 2-Step flows and capacities represent safe pressure limits.",
      };
    }
  } catch (e) {
    return null;
  }
}

/**
 * Parameters required to build a full macro script.
 */
export interface CompileMacroParams {
  pumps: PumpConfig[];
  fluidics: FluidicsConfig;
  reactionData: Record<string, Record<number, { vol: string; fr: string }>>;
  r1Heaters: Record<number, string>;
  r2Heaters: Record<number, string>;
  hubAddr: string;
  hubPort: string;
  finalSweepFr: string;
  autoSample: "Yes" | "No";
  auxA: string;
  auxB: string;
  asLogic: Record<string, AUXState>;
  r1MetricsBolus: string;
  r1MetricsFrSum: string;
  existingMacroContent: string;
}

/**
 * Result returned by `compileMacro`.
 */
export interface CompileMacroResult {
  newMacroContent: string;
  error?: string;
}

/**
 * Compiles a synthesis macro protocol script according to active parameters and returns the updated text.
 */
export function compileMacro(params: CompileMacroParams): CompileMacroResult {
  const {
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
    r1MetricsBolus,
    r1MetricsFrSum,
    existingMacroContent,
  } = params;

  const activePumps = pumps.filter((p) => p.addr !== "0" && p.addr.trim() !== "");
  if (activePumps.length === 0) {
    return {
      newMacroContent: existingMacroContent,
      error: "Cannot generate macro: No active pumps are configured in System settings.",
    };
  }

  const lines: string[] = [];
  const timestamp = new Date().toLocaleString();
  const isOneStep = fluidics.reactor2Vol <= 0;
  let handlesCompletionInternally = false;
  let finalSweepDurationMs = 0;

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

  // Step 0: Heaters setting and thermalizing
  lines.push(`# --- PROCESS STEP 0: HEATER TEMPERATURE STABILIZATION ---`);
  let targetTempSet = false;
  for (let idx = 1; idx <= 4; idx++) {
    const t1 = r1Heaters[idx] || "";
    const t2 = r2Heaters[idx] || "";
    const tempVal = (t1 || t2).trim();
    if (tempVal !== "" && tempVal !== "Off") {
      const cmd = formatHeaterCommand(idx, tempVal);
      if (cmd) {
        lines.push(`100\t${cmd}\tSet Heater ${idx} temperature to ${tempVal}°C`);
        targetTempSet = true;
      }
    }
  }
  if (targetTempSet) {
    lines.push(`${HEATER_WAIT_MS}\tM${HEATER_WAIT_MS}\tWait 30 seconds for heater temperature thermalization equilibrium`);
  } else {
    lines.push(`# AMBIENT SYSTEM\tRunning under standard temperature boundaries`);
  }
  lines.push("");

  // Manual sampling wait before refilling
  if (autoSample !== "Yes") {
    lines.push(`# --- PROCESS STEP 0.5: USER MANUAL SAMPLING PAUSE ---`);
    lines.push(`0\tWait\tStart reaction, place a new collection vial`);
    lines.push("");
  }

  // Step 1: Refill active pumps from Port 8
  lines.push(`# --- PROCESS STEP 1: INITIAL REFILL FROM PORT 8 ---`);
  let maxFillTimeMs = 0;
  activePumps.forEach((pump) => {
    const fillSpeedCounts = FILL_SPEED_COUNTS;
    const timeMs = (pump.steps / fillSpeedCounts) * 1000;
    if (timeMs > maxFillTimeMs) {
      maxFillTimeMs = timeMs;
    }
    const cmd = formatPumpCommand(pump.addr, "o8", fillSpeedCounts, "A", pump.steps);
    lines.push(`0\t${cmd}\tFill Pump ${pump.id} Syringe standard volume from port 8`);
  });
  lines.push("");

  // Step 2: Pressurization via sweep pump to Port 2
  lines.push(`# --- PROCESS STEP 2: FLUIDIC PRESSURIZATION ---`);
  const sweepPumpObj = activePumps.find((p) => p.sweep === "Yes");
  const pressDurationMs = PRESSURIZE_DURATION_MS;
  if (sweepPumpObj) {
    const { volSteps: pressSteps, fpsCounts: pressCounts } = computeSteps(
      sweepPumpObj,
      PRESSURIZE_VOL_UL,
      PRESSURIZE_FR_UL_MIN
    );
    const cmd = formatPumpCommand(sweepPumpObj.addr, "o2", pressCounts, "D", pressSteps);
    lines.push(`${Math.ceil(maxFillTimeMs)}\t${cmd}\tPressurize fluidics with Sweep Pump ${sweepPumpObj.id}: 50µL at 100µL/min`);
  } else {
    lines.push(`# NO SWEEP PUMP INSTALLED\tPressurization step bypassed`);
  }
  lines.push("");

  // Step 3: Scenario generation (1-step vs 2-step)
  if (isOneStep) {
    lines.push(`# --- PROCESS STEP 3: 1-STEP CO-DELIVERY MIXING (R1 PORT 5) ---`);
    let step3DelayVal = sweepPumpObj ? Math.ceil(pressDurationMs) : Math.ceil(maxFillTimeMs);

    // DH Port setting
    if (hubAddr && hubAddr !== "0" && hubAddr.trim() !== "") {
      lines.push(`${step3DelayVal}\t/${hubAddr}o${hubPort}R\tConfigure Distribution Hub (DH) to Port ${hubPort}`);
      step3DelayVal = 0;
    }

    // Automated sampling start
    if (autoSample === "Yes") {
      const st_a = asLogic["Start Collection"]?.["A"] === "ON" ? "TRUE" : "FALSE";
      const st_b = asLogic["Start Collection"]?.["B"] === "ON" ? "TRUE" : "FALSE";
      lines.push(`${step3DelayVal}\tAUX-${auxA} ${st_a}\tStart fraction collection valve A`);
      step3DelayVal = 0;
      lines.push(`${step3DelayVal}\tAUX-${auxB} ${st_b}\tStart fraction collection valve B`);
      lines.push(`${AUX_IDLE_DELAY_MS}\tAUX-${auxA} FALSE\tReset fraction collection valve A to Idle (OFF)`);
      lines.push(`0\tAUX-${auxB} FALSE\tReset fraction collection valve B to Idle (OFF)`);
    }

    // R1 pumps contemporary delivery
    const r1Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 1" || p.sweep === "Yes");
    let maxR1DeliveryTimeMs = 0;
    let injectCount = 0;

    r1Pumps.forEach((pump) => {
      const rData = reactionData["R1"]?.[pump.id] || { vol: "0", fr: "0" };
      const valVol = parseFloat(rData.vol) || 0;
      const valFr = parseFloat(rData.fr) || 0;
      if (valVol > 0 && valFr > 0) {
        const { volSteps, fpsCounts } = computeSteps(pump, valVol, valFr);
        const deliveryTimeMs = (valVol / valFr) * 60 * 1000;
        if (deliveryTimeMs > maxR1DeliveryTimeMs) {
          maxR1DeliveryTimeMs = deliveryTimeMs;
        }
        const cmd = formatPumpCommand(pump.addr, "o5", fpsCounts, "D", volSteps);
        lines.push(`${step3DelayVal}\t${cmd}\tSynchronized co-delivery Reactant Pump ${pump.id}: ${valVol}µL at ${valFr}µL/min`);
        step3DelayVal = 0;
        injectCount++;
      }
    });

    if (injectCount === 0) {
      lines.push(`# NO ACTIVE REACTOR 1 REAGENTS\tR1 co-delivery bypassed`);
    }
    lines.push("");

    // Step 4: Non-sweep R1 pumps turn to Port 7
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
          const cmd = formatPumpCommand(pump.addr, "o7", 0, "None", 0);
          lines.push(`${delayVal}\t${cmd}\tClose non-sweep Reactant Pump ${pump.id} (turn to plugged Port 7)`);
          turnedOthers = true;
        }
      }
    });
    lines.push("");

    // Step 5: Sweep purge to Port 2
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
        cumulatedFr = DEFAULT_CUMULATED_FR;
      }

      const r1Vol = fluidics.reactor1Vol;
      const { volSteps: r1VolSteps, fpsCounts: r1CumFrCounts } = computeSteps(sweepPumpObj, r1Vol, cumulatedFr);

      const sweepFirstDelay = turnedOthers ? 0 : injectCount > 0 ? delayAfterDelivery : step3DelayVal;
      const cmdFirst = formatPumpCommand(sweepPumpObj.addr, "o2", r1CumFrCounts, "D", r1VolSteps);
      lines.push(`${sweepFirstDelay}\t${cmdFirst}\tPurge Reactor 1 volume using Sweep Pump: ${r1Vol}µL at cumulated ${cumulatedFr.toFixed(2)}µL/min`);

      const sweepFirstDurationMs = (r1Vol / cumulatedFr) * 60 * 1000;
      const transferAndSweepVol = fluidics.transfer2Vol + fluidics.sweepVol;
      const sweepDeliveryFr = parseFloat(finalSweepFr) || DEFAULT_SWEEP_FR;
      const { volSteps: finalSweepSteps, fpsCounts: finalSweepCounts } = computeSteps(sweepPumpObj, transferAndSweepVol, sweepDeliveryFr);

      const cmdSecond = formatPumpCommand(sweepPumpObj.addr, "o2", finalSweepCounts, "D", finalSweepSteps);
      lines.push(`${Math.ceil(sweepFirstDurationMs)}\t${cmdSecond}\tPost-reaction sweep wash to Transfer & Sweep lines: ${transferAndSweepVol}µL at sweep rate ${sweepDeliveryFr}µL/min`);
      finalSweepDurationMs = (transferAndSweepVol / sweepDeliveryFr) * 60 * 1000;
    } else {
      lines.push(`# NO SWEEP PUMP ASSIGNED\tSweep delivery steps bypassed`);
    }
  } else {
    // 2-Steps Setup
    const b1 = parseFloat(r1MetricsBolus) || 0;
    const t1 = fluidics.transfer1Vol;
    const r1Vol = fluidics.reactor1Vol;
    const isScenarioA = b1 + r1Vol <= t1;
    const sweepDeliveryFr = parseFloat(finalSweepFr) || DEFAULT_SWEEP_FR;
    handlesCompletionInternally = false;

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
      cumulatedFr = DEFAULT_CUMULATED_FR;
    }

    if (isScenarioA) {
      lines.push(`# =========================================================`);
      lines.push(`# SCENARIO A: (R1 Bolus + Reactor 1 Volume) <= T1 Transfer Line Capacity`);
      lines.push(`# =========================================================`);
      lines.push(`# --- PROCESS STEP 3: 2-STEP STAGE 1 CO-DELIVERY MIXING (R1 PORT 5) ---`);
      let step3DelayVal = sweepPumpObj ? Math.ceil(pressDurationMs) : Math.ceil(maxFillTimeMs);

      if (hubAddr && hubAddr !== "0" && hubAddr.trim() !== "") {
        lines.push(`${step3DelayVal}\t/${hubAddr}o${hubPort}R\tConfigure Distribution Hub (DH) to Port ${hubPort}`);
        step3DelayVal = 0;
      }

      if (autoSample === "Yes") {
        const st_a = asLogic["Start Collection"]?.["A"] === "ON" ? "TRUE" : "FALSE";
        const st_b = asLogic["Start Collection"]?.["B"] === "ON" ? "TRUE" : "FALSE";
        lines.push(`${step3DelayVal}\tAUX-${auxA} ${st_a}\tStart fraction collection valve A`);
        step3DelayVal = 0;
        lines.push(`${step3DelayVal}\tAUX-${auxB} ${st_b}\tStart fraction collection valve B`);
        lines.push(`${AUX_IDLE_DELAY_MS}\tAUX-${auxA} FALSE\tReset fraction collection valve A to Idle (OFF)`);
        lines.push(`0\tAUX-${auxB} FALSE\tReset fraction collection valve B to Idle (OFF)`);
      }

      let maxR1DeliveryTimeMs = 0;
      let r1InjectCount = 0;
      r1Pumps.forEach((pump) => {
        const rData = reactionData["R1"]?.[pump.id] || { vol: "0", fr: "0" };
        const valVol = parseFloat(rData.vol) || 0;
        const valFr = parseFloat(rData.fr) || 0;
        if (valVol > 0 && valFr > 0) {
          const { volSteps, fpsCounts } = computeSteps(pump, valVol, valFr);
          const deliveryTimeMs = (valVol / valFr) * 60 * 1000;
          if (deliveryTimeMs > maxR1DeliveryTimeMs) {
            maxR1DeliveryTimeMs = deliveryTimeMs;
          }
          const cmd = formatPumpCommand(pump.addr, "o5", fpsCounts, "D", volSteps);
          lines.push(`${step3DelayVal}\t${cmd}\tSynchronized co-delivery Reactant Pump ${pump.id}: ${valVol}µL at ${valFr}µL/min`);
          step3DelayVal = 0;
          r1InjectCount++;
        }
      });
      if (r1InjectCount === 0) {
        lines.push(`# NO ACTIVE REACTOR 1 REAGENTS\tR1 co-delivery bypassed`);
      }
      lines.push("");

      // Step 4: Valve rotation to plugged Port 7
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
            const cmd = formatPumpCommand(pump.addr, "o7", 0, "None", 0);
            lines.push(`${delayVal}\t${cmd}\tClose non-sweep Reactant Pump ${pump.id} (turn to plugged Port 7)`);
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
        const { volSteps: r1PurgeVolSteps, fpsCounts: r1CumFrCounts } = computeSteps(sweepPumpObj, r1Vol, cumulatedFr);
        const cmdFirst = formatPumpCommand(sweepPumpObj.addr, "o2", r1CumFrCounts, "D", r1PurgeVolSteps);
        lines.push(`${sweepFirstDelay}\t${cmdFirst}\tPurge Reactor 1 volume using Sweep Pump: ${r1Vol}µL at cumulated ${cumulatedFr.toFixed(2)}µL/min`);

        const sweepFirstDurationMs = (r1Vol / cumulatedFr) * 60 * 1000;
        elapsedMsStep5 = sweepFirstDurationMs;

        const remainingT1Vol = t1 - (b1 + r1Vol);
        if (remainingT1Vol > 0) {
          const { volSteps: remSteps, fpsCounts: remCounts } = computeSteps(sweepPumpObj, remainingT1Vol, sweepDeliveryFr);
          const cmdSecond = formatPumpCommand(sweepPumpObj.addr, "o2", remCounts, "D", remSteps);
          lines.push(`${Math.ceil(sweepFirstDurationMs)}\t${cmdSecond}\tSweep remaining T1 capacity with Sweep Pump: ${remainingT1Vol.toFixed(1)}µL at sweep rate ${sweepDeliveryFr}µL/min`);
          const sweepSecondDurationMs = (remainingT1Vol / sweepDeliveryFr) * 60 * 1000;
          elapsedMsStep5 = sweepSecondDurationMs;
        }
      } else {
        lines.push(`0\t# NO SWEEP PUMP ASSIGNED\tPurge Reactor 1 bypassed`);
        elapsedMsStep5 = r1InjectCount > 0 ? maxR1DeliveryTimeMs : 0;
      }
      lines.push("");

      // Step 6: Reactor 2 co-delivery
      lines.push(`# --- PROCESS STEP 6: REACTOR 2 CO-DELIVERY MIXING ---`);
      const r2Pumps = activePumps.filter((p) => p.assignedReactor === "Reactor 2" || p.sweep === "Yes");
      let step6DelayVal = Math.ceil(elapsedMsStep5);
      let maxR2DeliveryTimeMs = 0;
      let r2InjectCount = 0;

      r2Pumps.forEach((pump) => {
        const rData = reactionData["R2"]?.[pump.id] || { vol: "0", fr: "0" };
        const valVol = parseFloat(rData.vol) || 0;
        const valFr = parseFloat(rData.fr) || 0;

        if (valVol > 0 && valFr > 0) {
          const { volSteps, fpsCounts } = computeSteps(pump, valVol, valFr);
          const deliveryTimeMs = (valVol / valFr) * 60 * 1000;
          if (deliveryTimeMs > maxR2DeliveryTimeMs) {
            maxR2DeliveryTimeMs = deliveryTimeMs;
          }
          const port = pump.sweep === "Yes" ? "o2" : "o5";
          const descStr = pump.sweep === "Yes"
            ? `Synchronized Reaction 2 delivery Sweep Pump ${pump.id}: ${valVol.toFixed(1)}µL at ${valFr}µL/min`
            : `Synchronized Reaction 2 delivery Reactant Pump ${pump.id}: ${valVol.toFixed(1)}µL at ${valFr}µL/min`;

          const cmd = formatPumpCommand(pump.addr, port, fpsCounts, "D", volSteps);
          lines.push(`${step6DelayVal}\t${cmd}\t${descStr}`);
          step6DelayVal = 0;
          r2InjectCount++;
        }
      });

      if (r2InjectCount === 0) {
        lines.push(`# NO ACTIVE REACTOR 2 REAGENTS\tR2 co-delivery bypassed`);
      }
      lines.push("");

      // Step 7: Reactor 2 non-sweep valve rotation to Port 7
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
            const cmd = formatPumpCommand(pump.addr, "o7", 0, "None", 0);
            lines.push(`${delayVal}\t${cmd}\tClose non-sweep Reactant Pump ${pump.id} (turn to plugged Port 7)`);
            turnedR2Others = true;
          }
        }
      });
      lines.push("");

      // Step 8: Sweep & Wash valves for Reactor 2
      lines.push(`# --- PROCESS STEP 8: SWEEP AND WASH VALVES FOR REACTOR 2 ---`);
      if (sweepPumpObj) {
        const step8DelayVal = turnedR2Others ? 0 : r2InjectCount > 0 ? delayAfterR2Delivery : step6DelayVal;
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
          cumulatedR2Fr = DEFAULT_CUMULATED_FR;
        }

        const { volSteps: r2VolSteps, fpsCounts: r2CumFrCounts } = computeSteps(sweepPumpObj, r2Vol, cumulatedR2Fr);
        const cmdFirst = formatPumpCommand(sweepPumpObj.addr, "o2", r2CumFrCounts, "D", r2VolSteps);
        lines.push(`${step8DelayVal}\t${cmdFirst}\tPurge Reactor 2 volume using Sweep Pump: ${r2Vol}µL at cumulated ${cumulatedR2Fr.toFixed(2)}µL/min`);

        const r2FirstDurationMs = (r2Vol / cumulatedR2Fr) * 60 * 1000;
        const finalSweepVol = fluidics.transfer2Vol + fluidics.sweepVol;
        const { volSteps: finalSweepSteps, fpsCounts: finalSweepCounts } = computeSteps(sweepPumpObj, finalSweepVol, sweepDeliveryFr);
        const washDurationMs = (finalSweepVol / sweepDeliveryFr) * 60 * 1000;
        const cmdSecond = formatPumpCommand(sweepPumpObj.addr, "o2", finalSweepCounts, "D", finalSweepSteps);
        lines.push(`${Math.ceil(r2FirstDurationMs)}\t${cmdSecond}\tPost-reaction sweep wash to T2 and Sweep Line: ${finalSweepVol}µL at sweep rate ${sweepDeliveryFr}µL/min`);

        handlesCompletionInternally = true;
        if (autoSample === "Yes") {
          const sp_a = asLogic["Stop Collection"]?.["A"] === "ON" ? "TRUE" : "FALSE";
          const sp_b = asLogic["Stop Collection"]?.["B"] === "ON" ? "TRUE" : "FALSE";
          lines.push(`${Math.ceil(washDurationMs)}\tAUX-${auxA} ${sp_a}\tStop fraction collection valve A`);
          lines.push(`0\tAUX-${auxB} ${sp_b}\tStop fraction collection valve B`);
          lines.push(`${AUX_IDLE_DELAY_MS}\tAUX-${auxA} FALSE\tReset fraction collection valve A to Idle (OFF)`);
          lines.push(`0\tAUX-${auxB} FALSE\tReset fraction collection valve B to Idle (OFF)`);
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
      // SCENARIO B: Absolute Timeline Dispatcher
      lines.push(`# =========================================================`);
      lines.push(`# SCENARIO B: (R1 Bolus + Reactor 1 Volume) > T1 Transfer Line Capacity`);
      lines.push(`# =========================================================`);

      handlesCompletionInternally = true;

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
        cumulatedR2Fr = DEFAULT_CUMULATED_FR;
      }

      const r2Vol = fluidics.reactor2Vol;
      const r2SweepDurMs = (r2Vol / cumulatedR2Fr) * 60 * 1000;
      const r2SweepEndAbsMs = sweepEndAbsMs + r2SweepDurMs;

      const finalSweepVol = fluidics.transfer2Vol + fluidics.sweepVol;
      const finalSweepDurMs = (finalSweepVol / sweepDeliveryFr) * 60 * 1000;
      const totalReactionEndAbsMs = r2SweepEndAbsMs + finalSweepDurMs;

      const commands: BCommand[] = [];

      // T = 0
      commands.push({
        absTimeMs: 0,
        priority: 0,
        command: `# --- PROCESS STEP 3: 2-STEP STAGE 1 CO-DELIVERY MIXING (R1 PORT 5) ---`,
        desc: "",
      });

      if (hubAddr && hubAddr !== "0" && hubAddr.trim() !== "") {
        commands.push({
          absTimeMs: 0,
          priority: 1,
          command: `/${hubAddr}o${hubPort}R`,
          desc: `Configure Distribution Hub (DH) to Port ${hubPort}`,
        });
      }

      if (autoSample === "Yes") {
        const st_a = asLogic["Start Collection"]?.["A"] === "ON" ? "TRUE" : "FALSE";
        const st_b = asLogic["Start Collection"]?.["B"] === "ON" ? "TRUE" : "FALSE";
        commands.push({
          absTimeMs: 0,
          priority: 1,
          command: `AUX-${auxA} ${st_a}`,
          desc: "Start fraction collection valve A",
        });
        commands.push({
          absTimeMs: 0,
          priority: 1,
          command: `AUX-${auxB} ${st_b}`,
          desc: "Start fraction collection valve B",
        });
        commands.push({
          absTimeMs: AUX_IDLE_DELAY_MS,
          priority: 1,
          command: `AUX-${auxA} FALSE`,
          desc: "Reset fraction collection valve A to Idle (OFF)",
        });
        commands.push({
          absTimeMs: AUX_IDLE_DELAY_MS,
          priority: 1,
          command: `AUX-${auxB} FALSE`,
          desc: "Reset fraction collection valve B to Idle (OFF)",
        });
      }

      r1Pumps.forEach((pump) => {
        const rData = reactionData["R1"]?.[pump.id] || { vol: "0", fr: "0" };
        const valVol = parseFloat(rData.vol) || 0;
        const valFr = parseFloat(rData.fr) || 0;
        if (valVol > 0 && valFr > 0) {
          const { volSteps, fpsCounts } = computeSteps(pump, valVol, valFr);
          const cmd = formatPumpCommand(pump.addr, "o5", fpsCounts, "D", volSteps);
          commands.push({
            absTimeMs: 0,
            priority: 2,
            command: cmd,
            desc: `Synchronized co-delivery Reactant Pump ${pump.id}: ${valVol}µL at ${valFr}µL/min`,
          });
        }
      });

      // T = reachR2Ms
      commands.push({
        absTimeMs: reachR2Ms,
        priority: 0,
        command: `# --- PROCESS STEP: REACTOR 2 REAGENTS MEET R1 BOLUS IN REACTOR 2 ---`,
        desc: "",
      });

      r2Pumps.forEach((pump) => {
        if (pump.sweep !== "Yes" && pump.assignedReactor === "Reactor 2") {
          const rData = reactionData["R2"]?.[pump.id] || { vol: "0", fr: "0" };
          const valVol = parseFloat(rData.vol) || 0;
          const valFr = parseFloat(rData.fr) || 0;
          if (valVol > 0 && valFr > 0) {
            const { volSteps, fpsCounts } = computeSteps(pump, valVol, valFr);
            const cmd = formatPumpCommand(pump.addr, "o5", fpsCounts, "D", volSteps);
            commands.push({
              absTimeMs: reachR2Ms,
              priority: 2,
              command: cmd,
              desc: `Synchronized Reaction 2 non-sweep Pump ${pump.id}: ${valVol.toFixed(1)}µL at ${valFr}µL/min`,
            });
          }
        }
      });

      // T = maxR1DeliveryTimeMs
      commands.push({
        absTimeMs: maxR1DeliveryTimeMs,
        priority: 0,
        command: `# --- PROCESS STEP 4: SEALS R1 PUMPS & DELIVERS R1 + T1 CAPACITIES ---`,
        desc: "",
      });

      r1Pumps.forEach((pump) => {
        if (pump.sweep !== "Yes" && pump.assignedReactor === "Reactor 1") {
          const rData = reactionData["R1"]?.[pump.id] || { vol: "0", fr: "0" };
          const valVol = parseFloat(rData.vol) || 0;
          const valFr = parseFloat(rData.fr) || 0;
          if (valVol > 0 && valFr > 0) {
            const cmd = formatPumpCommand(pump.addr, "o7", 0, "None", 0);
            commands.push({
              absTimeMs: maxR1DeliveryTimeMs,
              priority: 1,
              command: cmd,
              desc: `Close non-sweep Reactant Pump ${pump.id} (turn to plugged Port 7)`,
            });
          }
        }
      });

      if (sweepPumpObj) {
        const { volSteps, fpsCounts } = computeSteps(sweepPumpObj, sweepBVol, cumulatedFr);
        const cmd = formatPumpCommand(sweepPumpObj.addr, "o2", fpsCounts, "D", volSteps);
        commands.push({
          absTimeMs: maxR1DeliveryTimeMs,
          priority: 2,
          command: cmd,
          desc: `Sweep pump delivers (R1 + T1) capacity: ${sweepBVol.toFixed(1)}µL at cumulated ${cumulatedFr.toFixed(2)}µL/min via Port 2`,
        });
      }

      // T = sweepEndAbsMs
      commands.push({
        absTimeMs: sweepEndAbsMs,
        priority: 0,
        command: `# --- PROCESS STEP 5: SEALS R2 PUMPS & SWEEPS REACTOR 2 VOLUME ---`,
        desc: "",
      });

      r2Pumps.forEach((pump) => {
        if (pump.sweep !== "Yes" && pump.assignedReactor === "Reactor 2") {
          const rData = reactionData["R2"]?.[pump.id] || { vol: "0", fr: "0" };
          const valVol = parseFloat(rData.vol) || 0;
          const valFr = parseFloat(rData.fr) || 0;
          if (valVol > 0 && valFr > 0) {
            const cmd = formatPumpCommand(pump.addr, "o7", 0, "None", 0);
            commands.push({
              absTimeMs: sweepEndAbsMs,
              priority: 1,
              command: cmd,
              desc: `Close non-sweep Reaction 2 Pump ${pump.id} (turn to plugged Port 7)`,
            });
          }
        }
      });

      if (sweepPumpObj) {
        const { volSteps, fpsCounts } = computeSteps(sweepPumpObj, r2Vol, cumulatedR2Fr);
        const cmd = formatPumpCommand(sweepPumpObj.addr, "o2", fpsCounts, "D", volSteps);
        commands.push({
          absTimeMs: sweepEndAbsMs,
          priority: 2,
          command: cmd,
          desc: `Purge Reactor 2 volume using Sweep Pump: ${r2Vol.toFixed(1)}µL at cumulated ${cumulatedR2Fr.toFixed(2)}µL/min via Port 2`,
        });
      }

      // T = r2SweepEndAbsMs
      commands.push({
        absTimeMs: r2SweepEndAbsMs,
        priority: 0,
        command: `# --- PROCESS STEP 6: POST-REACTION SWEEP WASH TO T2 & SWEEP LINE ---`,
        desc: "",
      });

      if (sweepPumpObj) {
        const { volSteps, fpsCounts } = computeSteps(sweepPumpObj, finalSweepVol, sweepDeliveryFr);
        const cmd = formatPumpCommand(sweepPumpObj.addr, "o2", fpsCounts, "D", volSteps);
        commands.push({
          absTimeMs: r2SweepEndAbsMs,
          priority: 2,
          command: cmd,
          desc: `Post-reaction sweep wash: ${finalSweepVol.toFixed(1)}µL at sweep rate ${sweepDeliveryFr}µL/min via Port 2`,
        });
      }

      // T = totalReactionEndAbsMs
      commands.push({
        absTimeMs: totalReactionEndAbsMs,
        priority: 0,
        command: `# --- PROCESS STEP 7: PROCESS COMPLETION & FRACTION SEPARATION ---`,
        desc: "",
      });

      if (autoSample === "Yes") {
        const sp_a = asLogic["Stop Collection"]?.["A"] === "ON" ? "TRUE" : "FALSE";
        const sp_b = asLogic["Stop Collection"]?.["B"] === "ON" ? "TRUE" : "FALSE";
        commands.push({
          absTimeMs: totalReactionEndAbsMs,
          priority: 1,
          command: `AUX-${auxA} ${sp_a}`,
          desc: "Stop fraction collection valve A",
        });
        commands.push({
          absTimeMs: totalReactionEndAbsMs,
          priority: 1,
          command: `AUX-${auxB} ${sp_b}`,
          desc: "Stop fraction collection valve B",
        });
        commands.push({
          absTimeMs: totalReactionEndAbsMs + AUX_IDLE_DELAY_MS,
          priority: 1,
          command: `AUX-${auxA} FALSE`,
          desc: "Reset fraction collection valve A to Idle (OFF)",
        });
        commands.push({
          absTimeMs: totalReactionEndAbsMs + AUX_IDLE_DELAY_MS,
          priority: 1,
          command: `AUX-${auxB} FALSE`,
          desc: "Reset fraction collection valve B to Idle (OFF)",
        });
      } else {
        commands.push({
          absTimeMs: totalReactionEndAbsMs,
          priority: 1,
          command: "Wait",
          desc: "Reaction completed, retrieve collection vial",
        });
      }

      const runEndAbsMs = autoSample === "Yes" ? totalReactionEndAbsMs + AUX_IDLE_DELAY_MS : totalReactionEndAbsMs;
      commands.push({
        absTimeMs: runEndAbsMs,
        priority: 3,
        command: `# RUN END\tAdvion NanoTek Macro synthesis execution completed.`,
        desc: "",
      });

      commands.sort((c1, c2) => {
        if (Math.abs(c1.absTimeMs - c2.absTimeMs) > 1e-3) {
          return c1.absTimeMs - c2.absTimeMs;
        }
        return c1.priority - c2.priority;
      });

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

  // Stop automated collection if not handled internally
  if (!handlesCompletionInternally) {
    if (autoSample === "Yes") {
      lines.push("");
      lines.push(`# --- PROCESS STEP: STOP AUTOMATED FRACTION COLLECTION ---`);
      const sp_a = asLogic["Stop Collection"]?.["A"] === "ON" ? "TRUE" : "FALSE";
      const sp_b = asLogic["Stop Collection"]?.["B"] === "ON" ? "TRUE" : "FALSE";
      lines.push(`${Math.ceil(finalSweepDurationMs)}\tAUX-${auxA} ${sp_a}\tStop fraction collection valve A`);
      lines.push(`0\tAUX-${auxB} ${sp_b}\tStop fraction collection valve B`);
      lines.push(`${AUX_IDLE_DELAY_MS}\tAUX-${auxA} FALSE\tReset fraction collection valve A to Idle (OFF)`);
      lines.push(`0\tAUX-${auxB} FALSE\tReset fraction collection valve B to Idle (OFF)`);
    }

    if (autoSample !== "Yes") {
      lines.push("");
      lines.push(`# --- PROCESS STEP: RETRIEVE COLLECTION VIAL ---`);
      lines.push(`${Math.ceil(finalSweepDurationMs)}\tWait\tReaction completed, retrieve collection vial`);
    }

    lines.push("");
    lines.push(`# RUN END\tAdvion NanoTek Macro synthesis execution completed.`);
    lines.push("# =========================================================");
  }

  const chunk = lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        return `\t\t\t${trimmed}`;
      }
      return line;
    })
    .join("\n");

  const cleanedPrev = cleanOldMetrics(existingMacroContent);
  const combinedNoMetrics = cleanedPrev ? cleanedPrev + "\n\n" + chunk : chunk;
  const usedVols = getUsedLoopVolumes(pumps, combinedNoMetrics);
  const metricsText = makeMetricsBlock(pumps, usedVols);
  const newMacroContent = combinedNoMetrics + "\n\n" + metricsText;

  return { newMacroContent };
}
