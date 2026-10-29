import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  return spawnSync(command, args, {
    stdio: "inherit",
    shell: isWindows,
    env: process.env,
  });
}

function checkElectron() {
  console.log("\n[CallVortex] Verificando o Electron...");

  const result = run(pnpm, ["exec", "electron", "--version"]);
  return result.status === 0;
}

if (!existsSync("node_modules/electron/package.json")) {
  console.log("[CallVortex] Dependências ausentes. Instalando...");
  const install = run(pnpm, ["install"]);

  if (install.status !== 0) {
    console.error(
      "\n[CallVortex] Falha ao instalar dependências. " +
        "Verifique a conexão e execute pnpm install manualmente.",
    );
    process.exit(1);
  }
}

if (!checkElectron()) {
  console.log(
    "\n[CallVortex] Electron não iniciou corretamente. " +
      "Tentando reinstalar as dependências...",
  );

  const install = run(pnpm, ["install"]);

  if (install.status !== 0 || !checkElectron()) {
    console.error(
      "\n[CallVortex] Não foi possível preparar o Electron.\n" +
        "Verifique sua conexão com a internet e tente:\n" +
        "  pnpm install\n" +
        "  pnpm exec electron --version",
    );
    process.exit(1);
  }
}

console.log("[CallVortex] Electron pronto. Iniciando o ambiente...\n");
