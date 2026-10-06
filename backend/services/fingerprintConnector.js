// Talks the "ADMS / Cloud Server / PUSH" language used by ZKTeco, eSSL and many compatible machines.
// The MACHINE connects to OUR server (not the other way round). That is what makes it work
// when the server is on the internet (Render) and the machine is inside a restaurant's local network.

// Settings we send back on "hello"
function handshakeResponse(serialNumber, attlogStamp = "None") {
  return [
    `GET OPTION FROM: ${serialNumber}`,
    `ATTLOGStamp=${attlogStamp || "None"}`,
    "OPERLOGStamp=9999",
    "ATTPHOTOStamp=None",
    "ErrorDelay=30",
    "Delay=10",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=TransData AttLog",
    "Realtime=1",
    "Encrypt=None",
    "",
  ].join("\n");
}

// One scan line looks like: "101\t2026-10-01 09:05:12\t0\t1\t0\t0"
// A few older machines use spaces instead of tabs, so both are accepted.
function parseAttlog(body) {
  const records = [];
  for (const raw of String(body || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let parts = line.split("\t").map((p) => p.trim());
    if (parts.length < 2) {
      const sp = line.split(/\s+/);
      if (sp.length < 3) continue;
      parts = [sp[0], `${sp[1]} ${sp[2]}`, ...sp.slice(3)];
    }
    const [deviceUserId, punchTime, punchState = "", verifyMode = ""] = parts;
    if (!deviceUserId || !punchTime) continue;
    records.push({ deviceUserId, punchTime, punchState, verifyMode });
  }
  return records;
}

// "Ver 6.60,12,34,5678,..." -> firmware, users, fingerprints, logs
function parseInfo(info) {
  const p = String(info || "").split(",");
  if (p.length < 4) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { firmware: p[0].slice(0, 60), userCount: num(p[1]), fingerprintCount: num(p[2]), logCount: num(p[3]) };
}

// Command list for the machine: "C:<id>:<command>"
const commandResponse = (commands) => commands.map((c) => `C:${c.id}:${c.cmd}`).join("\n") + "\n";

// Body of /devicecmd: "ID=1&Return=0&CMD=CHECK"
function parseCommandReplies(body) {
  const ids = [];
  for (const line of String(body || "").split(/\r?\n/)) {
    const m = /(?:^|&)ID=(\d+)/.exec(line.trim());
    if (m) ids.push(Number(m[1]));
  }
  return ids;
}

module.exports = { handshakeResponse, parseAttlog, parseInfo, commandResponse, parseCommandReplies };