import { spawnSync } from "node:child_process";
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const root = process.cwd();
const backupDirectory = mkdtempSync(join(tmpdir(), "pip-netlify-env-"));
const movedFiles = [];
let deployStatus = 0;

try {
  hideLocalEnvFiles();
  cleanGeneratedNetlifyArtifacts();
  deployStatus = run("netlify", ["build", "--context", getBuildContext(process.argv.slice(2))], getModeEnv());
  if (deployStatus === 0) {
    deployStatus = prepareGeneratedNetlifyArtifacts();
  }
  if (deployStatus === 0) {
    deployStatus = run(
      "netlify",
      ["deploy", "--no-build", "--dir", ".netlify/static", "--functions", ".netlify/functions", ...getDeployArgs(process.argv.slice(2))],
      getModeEnv(),
    );
  }
} finally {
  restoreLocalEnvFiles();
  rmSync(backupDirectory, { recursive: true, force: true });
}

exitOnFailure(deployStatus);

function hideLocalEnvFiles() {
  for (const fileName of readdirSync(root)) {
    if (!isLocalEnvFile(fileName)) {
      continue;
    }

    const source = join(root, fileName);
    const destination = join(backupDirectory, fileName);

    if (!statSync(source).isFile()) {
      continue;
    }

    copyFileSync(source, destination);
    unlinkSync(source);
    movedFiles.push({ source, destination });
  }
}

function restoreLocalEnvFiles() {
  for (const { source, destination } of movedFiles.reverse()) {
    if (existsSync(destination)) {
      copyFileSync(destination, source);
      unlinkSync(destination);
    }
  }
}

function cleanGeneratedNetlifyArtifacts() {
  for (const directory of [".netlify/functions", ".netlify/functions-internal"]) {
    rmSync(join(root, directory), {
      recursive: true,
      force: true,
    });
  }
}

function prepareGeneratedNetlifyArtifacts() {
  const staticCopyStatus = copyNextStaticIntoServerFunction();
  if (staticCopyStatus !== 0) {
    return staticCopyStatus;
  }

  rmSync(join(root, ".netlify/static/cache"), {
    recursive: true,
    force: true,
  });

  return run("node", ["scripts/check-netlify-bundle.mjs"]);
}

function copyNextStaticIntoServerFunction() {
  const handlerDirectory = join(root, ".netlify/functions-internal/___netlify-server-handler");
  const source = join(root, ".next/static");
  const target = join(handlerDirectory, ".next/static");
  const zipPath = join(root, ".netlify/functions/___netlify-server-handler.zip");

  if (!existsSync(handlerDirectory)) {
    return 0;
  }

  if (!existsSync(source)) {
    console.error("Netlify Next server handler exists, but .next/static was not generated.");
    return 1;
  }

  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });

  if (!existsSync(zipPath)) {
    return 0;
  }

  return run("zip", ["-qr", zipPath, ".next/static"], {}, handlerDirectory);
}

function run(command, args, extraEnv = {}, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: "inherit",
  });

  return result.status ?? 1;
}

function exitOnFailure(status) {
  if (status !== 0) {
    process.exit(status);
  }
}

function getDeployArgs(args) {
  return args.filter((arg) => arg !== "--build" && arg !== "--skip-functions-cache");
}

function getBuildContext(args) {
  const contextFlagIndex = args.findIndex((arg) => arg === "--context");
  if (contextFlagIndex >= 0 && args[contextFlagIndex + 1]) {
    return args[contextFlagIndex + 1];
  }

  const inlineContext = args.find((arg) => arg.startsWith("--context="));
  if (inlineContext) {
    return inlineContext.slice("--context=".length);
  }

  return args.includes("--prod") || args.includes("--prod-if-unlocked") ? "production" : "deploy-preview";
}

function getModeEnv() {
  if (process.env.PIP_DEPLOY_MODE !== "fake") {
    return {};
  }

  return {
    PIP_SUPABASE_MODE: process.env.PIP_SUPABASE_MODE || "off",
  };
}

function isLocalEnvFile(fileName) {
  return fileName !== ".env.example" && /^\.env(?:\.|$)/.test(basename(fileName));
}
