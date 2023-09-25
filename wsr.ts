#!/usr/bin/env -S deno run -A --ext ts
import { $, YAML, chalk, glob } from "npm:zx@7.1.1";
import { cd } from "npm:zx@7.1.1";
import { parse } from "https://deno.land/std@0.202.0/flags/mod.ts";
import { expandGlobSync } from "https://deno.land/std@0.202.0/fs/expand_glob.ts";
import * as path from "https://deno.land/std@0.202.0/path/mod.ts";

type ModuleInfo = {
  type: "mixed" | "deno";
  path: string;
  shortName: string;
  pkgName?: string;
  npmScripts?: Record<string, string>;
  denoTasks?: Record<string, string>;
  root?: boolean;
};

type Context = {
  mod: ModuleInfo;
  cmd: string;
};

const HELP = `
npm-scripts runner for monorepo

Usage: wsr [module] [cmd]

Examples:
  $ wsr @pkg/foo test # run script in @pkg/foo
  $ wsr foo test      # run script in packages/<foo> (if dirname does not be duplicated)
  $ wsr foo           # list scripts in packages/foo
    foo [@pkg/foo] <root>/packages/foo
      test $ vitest --run src

  $ wsr packages/foo test         # run script in packages/foo
  $ cd packages && wsr ./foo test # run script in relative target

  $ wsr root test # run script from workspace root
  $ wsr test      # run script from workspace root (if "test" package does not exists)

  $ cd packages/foo && wsr test # prefer context task
`;

function debug(...msg: Array<any>): void {
  if (Deno.env.get("DEBUG")) {
    console.log(chalk.gray("[wsr:debug]"), ...msg);
  }
}

async function findWorkspaceRoot(
  cwd: string,
  deepest = false,
): Promise<string | void> {
  const split = cwd.split("/");
  let result: string | void = undefined;
  let latestPackageJson: string | void = undefined;
  let deepestPackageJson: string | void = undefined;
  do {
    const current = split.join("/");
    if (args.denoRoot && (await existsDenoConfig(current))) {
      return current;
    }
    if (await existsNpmPackage(current)) {
      if (!latestPackageJson) latestPackageJson = current;
      deepestPackageJson = current;
      // find lock or package.json with workspaces
      if (await exists(path.join(current, "yarn.lock"))) {
        result = current;
      }
      if (await exists(path.join(current, "package-lock.json"))) {
        result = current;
      }
      // pnpm does not have package.json#workspaces. so should check
      if (await exists(path.join(current, "pnpm-workspace.yaml"))) {
        result = current;
      }
      const pkg = JSON.parse(
        await Deno.readTextFile(path.join(current, "package.json")),
      ) as {
        workspaces?: string[] | object;
      };
      if (pkg.workspaces) {
        result = current;
      }

      if (!deepest && result) return result;
    }
  } while (split.pop());
  if (result) {
    return result;
  }

  if (deepest) return deepestPackageJson;
  return latestPackageJson;
}

async function findContextModule(cwd: string): Promise<string | void> {
  const split = cwd.split("/");
  do {
    const current = split.join("/");
    if (await existsNpmPackage(current)) {
      return current;
    }
    if (await existsDenoConfig(current)) {
      return current;
    }
  } while (split.pop());
}

function findModuleWithCmd(
  contextPath: string | void,
  cmd: string,
): Context | void {
  const contextMod = moduleInfos.find((t) => t.path === contextPath);
  if (contextMod?.npmScripts?.[cmd] || contextMod?.denoTasks?.[cmd]) {
    return { mod: contextMod, cmd: cmd };
  }

  const rootTask = moduleInfos.find((t) => t.root);
  if (rootTask?.npmScripts?.[cmd] || rootTask?.denoTasks?.[cmd]) {
    return { mod: rootTask, cmd: cmd };
  }
  return undefined;
}

async function findDenoModules(root: string) {
  const files = await glob("**/deno.{json,jsonc}", {
    cwd: root,
  });
  // console.log(files, root);
  // throw "stop";
  return files.map((file) => path.join(root, path.dirname(file)));
}

async function findNpmModules(root: string) {
  if (await exists(path.join(root, "pnpm-workspace.yaml"))) {
    const workspaces = YAML.parse(
      await Deno.readTextFile(path.join(root, "pnpm-workspace.yaml")),
    ) as {
      packages?: string[];
    };
    return (
      workspaces.packages?.flatMap((pkg) => {
        return [...expandGlobSync(`${root}/${pkg}`)].map((file) => file.path);
      }) ?? []
    );
  }

  if (await existsNpmPackage(root)) {
    const workspaces = JSON.parse(
      await Deno.readTextFile(path.join(root, "package.json")),
    ) as {
      workspaces?:
        | string[]
        | {
            packages?: string[];
          };
    };
    if (!workspaces) return [];

    const packages = Array.isArray(workspaces.workspaces)
      ? workspaces.workspaces
      : workspaces.workspaces?.packages;
    return (
      packages?.flatMap((pkg) => {
        return [...expandGlobSync(`${root}/${pkg}`)].map((file) => file.path);
      }) ?? []
    );
  }

  return [];
}

async function exists(path: string): Promise<boolean> {
  return await Deno.stat(path)
    .then(() => true)
    .catch(() => false);
}

async function existsDenoConfig(dir: string): Promise<boolean> {
  return (
    (await exists(path.join(dir, "deno.json"))) ||
    (await exists(path.join(dir, "deno.jsonc")))
  );
}

async function existsNpmPackage(dir: string): Promise<boolean> {
  return await exists(path.join(dir, "package.json"));
}

async function getPkgJson(modPath: string) {
  const pkg = JSON.parse(
    await Deno.readTextFile(path.join(modPath, "package.json")),
  ) as {
    name: string;
    scripts?: Record<string, string>;
    packageManager?: string;
  };
  return pkg;
}

type DenoConfig = {
  tasks?: Record<string, string>;
};
async function getDenoConfig(modPath: string) {
  let denoConfig: DenoConfig | undefined = undefined;
  if (await exists(path.join(modPath, "deno.json"))) {
    denoConfig = JSON.parse(
      await Deno.readTextFile(path.join(modPath, "deno.json")),
    ) as DenoConfig;
  } else if (await exists(path.join(modPath, "deno.jsonc"))) {
    denoConfig = JSON.parse(
      await Deno.readTextFile(path.join(modPath, "deno.jsonc")),
    ) as DenoConfig;
  }
  return denoConfig;
}

async function getPackageManager(root: string) {
  if (await exists(path.join(root, "package.json"))) {
    const pkg = await getPkgJson(root);
    if (pkg.packageManager) {
      debug(`client = ${pkg.packageManager}`);
      return pkg.packageManager.split("@")[0];
    }
  }
  return "npm";
}

async function getDenoModuleInfos(mods: string[], npmModules: string[]) {
  const infos: ModuleInfo[] = [];
  for (const mod of mods) {
    if (npmModules.includes(mod)) continue;

    const info: ModuleInfo = {
      type: "deno",
      path: mod,
      shortName: path.basename(mod),
      denoTasks: undefined,
    };
    if (await existsDenoConfig(mod)) {
      const denoConfig = await getDenoConfig(mod);
      if (denoConfig?.tasks) info.denoTasks = denoConfig.tasks;
    }
    infos.push(info);
  }
  return infos.sort((a, b) => a.shortName.localeCompare(b.shortName));
}

async function getNpmModuleInfos(root: string, mods: string[]) {
  const infos: ModuleInfo[] = [];
  for (const mod of mods) {
    const info: ModuleInfo = {
      type: "mixed",
      path: mod,
      shortName: path.basename(mod),
      pkgName: undefined,
      npmScripts: undefined,
      denoTasks: undefined,
    };
    if (await existsNpmPackage(mod)) {
      const pkg = await getPkgJson(mod);
      if (pkg.scripts) info.npmScripts = pkg.scripts;
      if (pkg.name) info.pkgName = pkg.name;
    }
    if (await existsDenoConfig(mod)) {
      const denoConfig = await getDenoConfig(mod);
      if (denoConfig?.tasks) info.denoTasks = denoConfig.tasks;
    }

    infos.push(info);
  }

  // add root tasks
  if (await existsNpmPackage(root)) {
    const info: ModuleInfo = {
      type: "mixed",
      path: root,
      shortName: "root",
      pkgName: undefined,
      npmScripts: undefined,
      denoTasks: undefined,
      root: true,
    };

    if (await existsNpmPackage(root)) {
      const pkg = await getPkgJson(root);
      if (pkg.scripts) info.npmScripts = pkg.scripts;
      if (pkg.name) info.pkgName = pkg.name;
    }
    if (await existsDenoConfig(root)) {
      const denoConfig = await getDenoConfig(root);
      if (denoConfig?.tasks) info.denoTasks = denoConfig.tasks;
    }
    const pkg = await getPkgJson(root);
    // if (pkg.scripts) info.npmScripts = pkg.scripts;
    info.pkgName = pkg.name ?? "root";
    infos.push(info);
  }
  return infos.sort((a, b) => a.shortName.localeCompare(b.shortName));
}

function printModuleScripts(
  root: string,
  info: ModuleInfo,
  isUniqueShortName: boolean,
  longest: string,
) {
  if (info.type === "deno" && info.denoTasks) {
    console.log(
      `🦕 ${info.shortName} <root>/${path.relative(root, info.path)}`,
    );
    for (const [name, cmd] of Object.entries(info.denoTasks)) {
      const spaces = " ".repeat(longest.length - name.length);
      console.log(`  ${name}${spaces} $ ${cmd.trim()}`);
    }
  }

  if (info.type === "mixed") {
    if (isUniqueShortName) {
      const relativePath = path.relative(root, info.path);
      const pkgExpr =
        info.pkgName === info.shortName
          ? info.shortName
          : `${info.shortName} [${info.pkgName}]`;
      console.log(`📦 ${pkgExpr} <root>/${relativePath}`);
    } else {
      const relativePath = path.relative(root, info.path);
      console.log(`${relativePath}`);
    }
    if (info.npmScripts) {
      for (const [name, cmd] of Object.entries(info.npmScripts)) {
        const spaces = " ".repeat(longest.length - name.length);
        console.log(`  ${name}${spaces} $ ${cmd.trim()}`);
      }
    }
    if (info.denoTasks) {
      for (const [name, cmd] of Object.entries(info.denoTasks)) {
        const spaces = " ".repeat(longest.length - name.length);
        console.log(`  ${name}${spaces} $ ${cmd.trim()}`);
      }
    }
  }
}

// ======== run =========

const args = parse(Deno.args);
if (args.help || args.h) {
  console.log(HELP);
  Deno.exit(0);
}
const expr = args._[0] as string | undefined;
const root_ = await findWorkspaceRoot(Deno.cwd());

const context = await findContextModule(Deno.cwd());

const root = (root_ ?? context) as string;

if (!root) {
  console.error("[wsr:err] module not found");
  Deno.exit(1);
}

const mods = await findNpmModules(root);
const npmModuleInfos = await getNpmModuleInfos(root, mods);

const denoMods = await findDenoModules(root);
const denoModuleInfos = await getDenoModuleInfos(denoMods, mods);

const moduleInfos: ModuleInfo[] = [...npmModuleInfos, ...denoModuleInfos];

debug(`root = ${root.replace(Deno.env.get("HOME")!, "~")}`);
if (root !== context) {
  debug(`context = ${path.relative(root, context ?? "")}`);
} else {
  debug("context = .");
}

Deno.env.set("FORCE_COLOR", "1");

if (expr) {
  let mod = moduleInfos.find((t) => {
    return (
      (t.type === "mixed" && t.pkgName === expr) ||
      // match tasks foo
      t.shortName === expr ||
      // match: tasks ./foo or ../foos
      (expr.startsWith(".") && t.path === path.join(Deno.cwd(), expr)) ||
      // match tasks foo
      path.resolve(root, expr) === t.path
    );
  });

  let cmd = args._[1] as string | undefined;
  if (!mod) {
    const ctx = findModuleWithCmd(context, expr);
    if (!ctx) {
      console.error(`[wsr:err] not found ${expr}`);
      Deno.exit(1);
    }
    if (ctx.mod.type === "mixed") {
      debug(`task = ${ctx.mod.pkgName ?? "<root>"}#${expr}`);
    }

    mod = ctx.mod;
    cmd = ctx.cmd;
  }

  // print target tasks
  if (!cmd) {
    const isUniqueDirname =
      moduleInfos.filter((t) => t.shortName === mod!.shortName).length === 1;
    const longest = Object.keys(
      (mod.type === "mixed" ? mod.npmScripts : mod.denoTasks) ?? [],
    ).reduce((a, b) => (a.length > b.length ? a : b));
    printModuleScripts(root, mod, isUniqueDirname, longest);
    Deno.exit(0);
  }

  if (mod.type === "mixed" && mod.npmScripts?.[cmd]) {
    const npmClient = await getPackageManager(root);
    cd(mod.path);
    const out = await $`${npmClient} run ${cmd}`;
    Deno.exit(out.exitCode ?? 0);
  } else if (mod.type === "deno" && mod.denoTasks?.[cmd]) {
    cd(mod.path);
    const out = await $`deno task ${cmd}`;
    Deno.exit(out.exitCode ?? 0);
  } else {
    console.error(`[wsr] task not found ${cmd}`);
    Deno.exit(1);
  }
} else {
  const longest = moduleInfos
    .flatMap((info) => [
      ...Object.keys(info.npmScripts ?? []),
      ...Object.keys(info.denoTasks ?? []),
    ])
    .reduce((a, b) => (a.length > b.length ? a : b));
  // console.log(longest);
  for (const task of moduleInfos) {
    const isUnique =
      moduleInfos.filter((t) => t.shortName === task.shortName).length === 1;
    printModuleScripts(root, task, isUnique, longest);
  }
}
