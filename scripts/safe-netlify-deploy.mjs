import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
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

try {
  hideLocalEnvFiles();
  cleanGeneratedNetlifyArtifacts();
  run("netlify", ["deploy", "--build", ...getDeployArgs(process.argv.slice(2))], getModeEnv());
} finally {
  restoreLocalEnvFiles();
  rmSync(backupDirectory, { recursive: true, force: true });
}

run("node", ["scripts/check-netlify-bundle.mjs"]);

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

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getDeployArgs(args) {
  if (args.includes("--skip-functions-cache")) {
    return args;
  }

  return ["--skip-functions-cache", ...args];
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
