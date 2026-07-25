/**
 * Configuration for a single high-pressure syringe pump (Kloehn/Cavro compatible).
 * Address "0" indicates that the pump is disabled and excluded from macro operations.
 */
export interface PumpConfig {
  /** Physical pump ID (1–4), used as display label */
  id: number;
  /** Kloehn protocol bus address ("0" = disabled) */
  addr: string;
  /** Full-stroke step resolution (typically 48,000 steps) */
  steps: number;
  /** Installed syringe volume in µL (e.g. 250, 500, 1000) */
  syringeVol: number;
  /** Calibrated static loop volume in µL — must not exceed syringeVol */
  loopVol: number;
  /** Target reactor channel assigned to this pump */
  assignedReactor: "Reactor 1" | "Reactor 2";
  /** Whether this pump serves as the designated sweep/flush pump */
  sweep: "Yes" | "No";
}

/**
 * Calibrated microfluidic line and reactor volumes in microliters (µL).
 */
export interface FluidicsConfig {
  /** Reactor 1 internal holding volume in µL */
  reactor1Vol: number;
  /** Reactor 2 internal holding volume in µL (0 = 1-Step mode) */
  reactor2Vol: number;
  /** Transfer Line 1 volume connecting Reactor 1 to Reactor 2 */
  transfer1Vol: number;
  /** Transfer Line 2 volume connecting Reactor 2 to output/collection */
  transfer2Vol: number;
  /** Dedicated sweep tubing volume in µL */
  sweepVol: number;
}

/**
 * Reaction parameters (volume and flow rate) for a single channel.
 */
export interface ReactionConfig {
  /** Reagent volume in µL */
  volume: string;
  /** Flow rate in µL/min */
  rate: string;
}

/**
 * State configuration for auxiliary collection relay valves (AUX A / AUX B).
 */
export interface AUXState {
  /** Human-readable event label (e.g. "Start Collection") */
  label: string;
  /** Auxiliary valve A binary relay state */
  A: "ON" | "OFF";
  /** Auxiliary valve B binary relay state */
  B: "ON" | "OFF";
}

/**
 * Saved macro file definition.
 */
export interface Macro {
  /** Macro protocol file name */
  name: string;
  /** Tab-delimited macro script content */
  content: string;
  /** Whether script conforms to GMP validation standards */
  isGmp: boolean;
}

/**
 * Console timeline log entry.
 */
export interface LogLine {
  /** ISO/locale timestamp string */
  timestamp: string;
  /** Log message body */
  message: string;
  /** Severity level for console coloring */
  type: "info" | "success" | "error" | "warning";
}

/**
 * Timeline command item used during Scenario B macro compilation dispatcher.
 */
export interface BCommand {
  /** Absolute execution timestamp in milliseconds from step start */
  absTimeMs: number;
  /** Priority ordering for simultaneous commands (0 = comment header, 1 = valve/aux, 2 = pump drive, 3 = completion) */
  priority: number;
  /** Command string or comment text */
  command: string;
  /** Human-readable operational description */
  desc: string;
}
