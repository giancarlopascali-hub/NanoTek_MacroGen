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
