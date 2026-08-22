/**
 * Constants for the Advion NanoTek Macro Generator.
 * Consolidates hardware, timing, volume, and protocol magic numbers into named, documented constants.
 */

/** Standard syringe fill speed in motor counts/s used during Step 1 refill */
export const FILL_SPEED_COUNTS = 1200;

/** Maximum allowed velocity counts/s for Kloehn syringe pumps */
export const MAX_VELOCITY_COUNTS = 6400;

/** Fixed pressurization volume in µL during Step 2 */
export const PRESSURIZE_VOL_UL = 50;

/** Fixed pressurization flow rate in µL/min during Step 2 */
export const PRESSURIZE_FR_UL_MIN = 100;

/** Pressurization duration in ms: (50 µL / 100 µL/min) * 60 * 1000 = 30000 ms */
export const PRESSURIZE_DURATION_MS = 30000;

/** Heater thermalization wait time in ms after setting temperature setpoints */
export const HEATER_WAIT_MS = 30000;

/** Flow rate matching tolerance in µL/min for 2-Step safety audit */
export const FLOW_RATE_TOLERANCE = 0.05;

/** Kloehn Distribution Hub (DH) fixed hardware address */
export const DH_ADDRESS = "7";

/** Maximum console log entries to retain in memory */
export const MAX_CONSOLE_LOGS = 500;

/** Default fallback sweep flow rate in µL/min if unconfigured */
export const DEFAULT_SWEEP_FR = 120.0;

/** Default fallback cumulated flow rate in µL/min */
export const DEFAULT_CUMULATED_FR = 100.0;

/** Inter-step pulse delay in ms before resetting AUX channels to Idle (OFF) */
export const AUX_IDLE_DELAY_MS = 50;
