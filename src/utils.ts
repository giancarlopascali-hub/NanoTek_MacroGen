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
