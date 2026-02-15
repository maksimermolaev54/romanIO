const { execSync } = require("child_process");

const port = Number(process.env.PORT || 8765);

function getPidsByPort(targetPort) {
  let output = "";
  try {
    output = execSync(`netstat -ano -p tcp | findstr :${targetPort}`, { encoding: "utf8" });
  } catch {
    return [];
  }

  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const tokens = line.trim().split(/\s+/);
    const pid = tokens[tokens.length - 1];
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  return [...pids];
}

const pids = getPidsByPort(port);
for (const pid of pids) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
  } catch {
    // Ignore if process already stopped.
  }
}

console.log(`Restarting server on port ${port}...`);
execSync(`"${process.execPath}" server.js`, { stdio: "inherit" });
