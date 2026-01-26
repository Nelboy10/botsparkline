import fs from "fs";

export function saveCSV(data, filePath) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]).join(";");
  const rows = data.map(row =>
    Object.values(row).map(v => `"${(v || "").replace(/"/g, '""')}"`).join(";")
  );

  const csv = [headers, ...rows].join("\n");

  fs.writeFileSync(filePath, csv, "utf-8");
}
