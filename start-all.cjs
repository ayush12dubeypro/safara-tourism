const { spawn } = require("child_process");

const cwd = process.cwd();

function start(name, script) {
  const child = spawn(process.execPath, [script], {
    cwd,
    stdio: "inherit",
    shell: false,
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
    }
  });

  return child;
}

console.log("Starting Safara website on http://127.0.0.1:3000");
console.log("Starting Safara chatbot on http://127.0.0.1:3001");

start("site", "serve-static.cjs");
start("chatbot", "chatbot-server.mjs");
