#!/usr/bin/env -S deno run -A --ext ts
import { $, chalk } from "npm:zx@7.1.1";
import { cd } from "npm:zx@7.1.1";
import { parse } from "https://deno.land/std@0.202.0/flags/mod.ts";
import { expandGlobSync } from "https://deno.land/std@0.202.0/fs/expand_glob.ts";
import * as path from "https://deno.land/std@0.202.0/path/mod.ts";
import { parse as parseYaml } from "https://deno.land/std@0.202.0/yaml/mod.ts";

type ModuleInfo = {
  path: string;
  shortName: string;
  pkgName?: string;
  npmScripts?: Record<string, string>;
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
    if (await exists(path.join(current, "package.json"))) {
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
    if (await exists(path.join(current, "package.json"))) {
      return current;
    }
  } while (split.pop());
}

function findModuleWithCmd(
  contextPath: string | void,
  cmd: string,
): Context | void {
  const contextMod = moduleInfos.find((t) => t.path === contextPath);
  if (contextMod?.npmScripts?.[cmd]) {
    return { mod: contextMod, cmd: cmd };
  }
  const rootTask = moduleInfos.find((t) => t.root)!;
  const rootCmd = rootTask.npmScripts?.[cmd];
  if (rootCmd) {
    return { mod: rootTask, cmd: cmd };
  }
  return undefined;
}

async function findModules(root: string) {
  if (await exists(path.join(root, "pnpm-workspace.yaml"))) {
    const workspaces = parseYaml(
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

  if (Array.isArray(workspaces.workspaces)) {
    return (
      workspaces.workspaces?.flatMap((pkg) => {
        return [...expandGlobSync(`${root}/${pkg}`)].map((file) => file.path);
      }) ?? []
    );
  }

  return (
    workspaces.workspaces?.packages?.flatMap((pkg) => {
      return [...expandGlobSync(`${root}/${pkg}`)].map((file) => file.path);
    }) ?? []
  );
}

async function exists(path: string): Promise<boolean> {
  return await Deno.stat(path)
    .then(() => true)
    .catch(() => false);
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

async function getModuleInfos(root: string, mods: string[]) {
  const infos: ModuleInfo[] = [];
  for (const mod of mods) {
    const info: ModuleInfo = {
      path: mod,
      shortName: path.basename(mod),
      pkgName: undefined,
      npmScripts: undefined,
    };
    if (await exists(path.join(mod, "package.json"))) {
      const pkg = await getPkgJson(mod);
      if (pkg.scripts) info.npmScripts = pkg.scripts;
      if (pkg.name) info.pkgName = pkg.name;
    }
    infos.push(info);
  }

  // add root tasks
  if (await exists(path.join(root, "package.json"))) {
    const info: ModuleInfo = {
      path: root,
      shortName: "root",
      pkgName: undefined,
      npmScripts: undefined,
      root: true,
    };
    const pkg = await getPkgJson(root);
    if (pkg.scripts) info.npmScripts = pkg.scripts;
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
  if (isUniqueShortName) {
    const relativePath = path.relative(root, info.path);
    const pkgExpr =
      info.pkgName === info.shortName
        ? info.shortName
        : `${info.shortName} [${info.pkgName}]`;
    console.log(`${pkgExpr} <root>/${relativePath}`);
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
if (!root) {
  console.warn("[wsr] workspace not found");
}

Deno.env.set("FORCE_COLOR", "1");

const mods = await findModules(root);
const moduleInfos = await getModuleInfos(root, mods);
debug(`root = ${root.replace(Deno.env.get("HOME")!, "~")}`);
if (root !== context) {
  debug(`context = ${path.relative(root, context ?? "")}`);
} else {
  debug("context = .");
}

if (expr) {
  let mod = moduleInfos.find((t) => {
    return (
      t.pkgName === expr ||
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
    debug(`task = ${ctx.mod.pkgName ?? "<root>"}#${expr}`);

    mod = ctx.mod;
    cmd = ctx.cmd;
  }

  // print target tasks
  if (!cmd) {
    const isUniqueDirname =
      moduleInfos.filter((t) => t.shortName === mod!.shortName).length === 1;
    const longest = Object.keys(mod.npmScripts ?? []).reduce((a, b) =>
      a.length > b.length ? a : b,
    );
    printModuleScripts(root, mod, isUniqueDirname, longest);
    Deno.exit(0);
  }

  if (mod.npmScripts?.[cmd]) {
    const npmClient = await getPackageManager(root);

    cd(mod.path);
    const out = await $`${npmClient} run ${cmd}`;
    // console.log("status-code", out);
    Deno.exit(out.exitCode ?? 0);
  } else {
    console.error(`[wsr] task not found ${cmd}`);
    Deno.exit(1);
  }
} else {
  const longest = moduleInfos
    .flatMap((info) => Object.keys(info.npmScripts ?? []))
    .reduce((a, b) => (a.length > b.length ? a : b));
  for (const task of moduleInfos) {
    const isUnique =
      moduleInfos.filter((t) => t.shortName === task.shortName).length === 1;
    printModuleScripts(root, task, isUnique, longest);
  }
}
