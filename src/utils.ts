/**
 * Formats a heater set-point command using the Advion thermal controller serial protocol.
 *
 * Frame Format:  `\x02` (STX) + `L` + `addr` (2 digits) + `02` + `value_x100` (8 digits) + `BCC` (2 hex digits) + `\x03` (ETX)
 *   - `addr`: 31 + heaterIndex (Heaters 1–4 map to addresses 32–35)
 *   - `value_x100`: Target temperature in °C multiplied by 100, zero-padded to 8 digits
 *   - `BCC`: Block Check Character computed as `(sum(ASCII codes of cmdBody) - 588) & 0xFF`
 *           The 588 constant is a protocol offset required by the Advion hardware controller.
 *
 * @param heaterIdx - Heater channel index (1 to 4)
 * @param tempValStr - Target temperature string (e.g. "100" for 100°C)
 * @returns Formatted binary protocol command string, or empty string if input is invalid
 */
export function formatHeaterCommand(heaterIdx: number, tempValStr: string): string {
  const tempVal = parseFloat(tempValStr);
  if (isNaN(tempVal)) return "";

  const valueX100 = Math.round(tempVal * 100);
  const valueStr = valueX100.toString().padStart(8, "0");
  const addr = (31 + heaterIdx).toString();
  const cmdBody = `L${addr}02${valueStr}`;

  let sum = 0;
  for (let i = 0; i < cmdBody.length; i++) {
    sum += cmdBody.charCodeAt(i);
  }

  const bccByte = (sum - 588) & 0xFF;
  const bccHex = bccByte.toString(16).toUpperCase().padStart(2, "0");

  return `\x02${cmdBody}${bccHex}\x03`;
}

/**
 * Formats a Kloehn/Cavro syringe pump command string.
 *
 * Kloehn Timing Model:
 * Each motor step is timed by a hardware clock frequency. Two base clock rates are supported:
 * 700 Hz and 800 Hz. The step-delay register `X` introduces idle delay cycles between steps.
 * Effective step period = `(13 + 1000/clockRate + X)` microseconds.
 *
 * For low speeds (< 60 counts/s), this function calculates the optimal clock rate (700 or 800 Hz)
 * and `X` register value that minimizes step timing error:
 *   - Command syntax: `/{addr}{valve}gv{clockHz}{action}1M{X}G{steps}R`
 *     - `g`: Set fine timing mode
 *     - `v`: Set velocity clock rate (700 or 800)
 *     - `M`: Set step delay register (X)
 *     - `G`: Move relative steps
 *     - `R`: Run command buffer immediately
 *
 * For standard speeds (>= 60 counts/s), the direct velocity syntax is generated:
 *   - `/{addr}{valve}V{speed}{action}{steps}R`
 *
 * @param addr - Pump RS-485 bus address ("1"–"4"). "0" or empty indicates a disabled pump.
 * @param port - Valve port selection (e.g. "o5", "o2", "o7", "o8", or null / "None" for no valve move).
 * @param speed - Flow velocity in counts/s.
 * @param action - Motor action ("D" = Dispense, "P" = Plunge/Aspirate, "A" = Absolute, "None" = Valve only).
 * @param steps - Number of motor steps to travel.
 * @returns Formatted Kloehn command string.
 */
export function formatPumpCommand(
  addr: string,
  port: string | null,
  speed: number,
  action: "D" | "P" | "A" | "None" | string,
  steps: number
): string {
  if (addr === "0" || !addr) {
    return "# Invalid Pump Address";
  }

  let valveStr = "";
  if (port && port !== "None" && port !== "") {
    valveStr = port.startsWith("o") ? port : `o${port}`;
  }

  if (action !== "None" && action !== "" && steps > 0 && speed > 0 && speed < 60) {
    const t_step = 1000 / speed;
    let v = 700;
    let x = Math.round(t_step - (13 + 1000 / 700));
    const err700 = Math.abs((13 + 1000 / 700 + x) - t_step);

    let x8 = Math.round(t_step - (13 + 1000 / 800));
    const err800 = Math.abs((13 + 1000 / 800 + x8) - t_step);

    if (err800 < 0.05 && err700 >= 0.1) {
      v = 800;
      x = x8;
    }

    if (x < 0) x = 0;
    return `/${addr}${valveStr}gv${v}${action}1M${x}G${steps}R`;
  }

  const speedStr = speed > 0 ? `V${speed}` : "";
  const actionStr = (action !== "None" && action !== "" && steps > 0) ? `${action}${steps}` : "";
  return `/${addr}${valveStr}${speedStr}${actionStr}R`;
}
