export interface PumpConfig {
  id: number;
  addr: string;
  steps: number;
  syringeVol: number;
  loopVol: number;
  assignedReactor: "Reactor 1" | "Reactor 2";
  sweep: "Yes" | "No";
}

export interface FluidicsConfig {
  reactor1Vol: number;
  reactor2Vol: number;
  transfer1Vol: number;
  transfer2Vol: number;
  sweepVol: number;
}

export interface ReactionConfig {
  volume: string;
  rate: string;
}

export interface AUXState {
  label: string;
  A: "ON" | "OFF";
  B: "ON" | "OFF";
}

export interface Macro {
  name: string;
  content: string;
  isGmp: boolean;
}

export interface LogLine {
  timestamp: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
}
