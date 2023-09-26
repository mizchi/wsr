#!/usr/bin/env -S deno run -A --ext ts
import { path, $, YAML, argv, cd, chalk, glob } from "npm:zx@7.1.1";

type ModuleInfo = {
  path: string;
  shortName: string;
  pkgName?: string;
  npmScripts?: Record<string, string>;
  denoTasks?: Record<string, string>;
  root?: boolean;
};

type ResolvedContext = {
  mod: ModuleInfo;
  cmd?: string;
};

type DenoConfig = {
  [key: string]: any;
  tasks?: Record<string, string>;
};

const HELP = `
npm-scripts runner for monorepo

Usage: wsr <module> <cmd>

Examples:
  $ wsr @pkg/foo test # run script in @pkg/foo
  $ wsr foo test      # run script in packages/<foo> (if dirname does not be duplicated)
  $ wsr foo           # list scripts in packages/foo
    foo [@pkg/foo] <root>/packages/foo
      test $ vitest --run src
  $ wsr echo -- a b c # passing args to script
  
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

async function findWorkspaceRoot(cwd: string): Promise<string | void> {
  const split = cwd.split("/");
  let latestMod: string | void = undefined;
  do {
    const current = split.join("/");
    if (await existsDenoConfig(current)) {
      latestMod ??= current;
    }
    if (await existsNpmPackage(current)) {
      latestMod ??= current;
      if (
        (await exists(path.join(current, "yarn.lock"))) ||
        (await exists(path.join(current, "package-lock.json"))) ||
        (await exists(path.join(current, "pnpm-workspace.yaml")))
      ) {
        return current;
      }
      const pkg = JSON.parse(
        await Deno.readTextFile(path.join(current, "package.json")),
      ) as {
        workspaces?: string[] | object;
      };
      if (pkg.workspaces) {
        return current;
      }
    }
  } while (split.pop());
  return latestMod;
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

async function getModules(root: string): Promise<ModuleInfo[]> {
  const mods = await getNpmModules(root);
  const denoMods = await getDenoModules(root, mods);
  return [...mods, ...denoMods];

  async function resolveDenoModules(root: string) {
    const files = await glob("**/deno.{json,jsonc}", {
      cwd: root,
    });
    return files.map((file) => path.join(root, path.dirname(file)));
  }

  function createGlob(root: string) {
    return (pattern: string) => {
      if (pattern.includes("*")) {
        return glob
          .globbySync(pattern, { cwd: root, onlyDirectories: true })
          .sort()
          .map((file) => path.join(root, file));
      } else {
        return [path.join(root, pattern)];
      }
    };
  }

  async function getDenoModules(root: string, npmModuleInfos: ModuleInfo[]) {
    const infos: ModuleInfo[] = [];
    const denoMods = await resolveDenoModules(root);
    for (const mod of denoMods) {
      if (npmModuleInfos.find((t) => t.path === mod)) continue;

      const info: ModuleInfo = {
        path: mod,
        shortName: path.basename(mod),
        denoTasks: undefined,
      };
      if (await existsDenoConfig(mod)) {
        const denoConfig = await readDenoJson(mod);
        if (denoConfig?.tasks) info.denoTasks = denoConfig.tasks;
      }
      if (await existsNpmPackage(mod)) {
        const pkg = await getPkgJson(mod);
        if (pkg.name) info.pkgName = pkg.name;
        if (pkg.scripts) info.npmScripts = pkg.scripts;
      }
      infos.push(info);
    }
    return infos.sort((a, b) => a.shortName.localeCompare(b.shortName));
  }

  async function getNpmModules(root: string) {
    const mods = await resolveNpmModules(root);

    const infos: ModuleInfo[] = [];
    for (const mod of mods) {
      const info: ModuleInfo = {
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
        const denoConfig = await readDenoJson(mod);
        if (denoConfig?.tasks) info.denoTasks = denoConfig.tasks;
      }

      infos.push(info);
    }

    // add root tasks
    if (await existsNpmPackage(root)) {
      const info: ModuleInfo = {
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
        const denoConfig = await readDenoJson(root);
        if (denoConfig?.tasks) info.denoTasks = denoConfig.tasks;
      }
      infos.push(info);
    }
    return infos.sort((a, b) => a.shortName.localeCompare(b.shortName));
  }

  async function resolveNpmModules(root: string) {
    if (await exists(path.join(root, "pnpm-workspace.yaml"))) {
      const workspaces = YAML.parse(
        await Deno.readTextFile(path.join(root, "pnpm-workspace.yaml")),
      ) as {
        packages?: string[];
      };
      return workspaces.packages?.flatMap(createGlob(root)) ?? [];
    }

    if (await existsNpmPackage(root)) {
      const pkg = JSON.parse(
        await Deno.readTextFile(path.join(root, "package.json")),
      ) as {
        workspaces?:
          | string[]
          | {
              packages?: string[];
            };
      };
      const packages =
        pkg.workspaces && Array.isArray(pkg.workspaces)
          ? pkg.workspaces
          : pkg.workspaces?.packages;
      return packages?.flatMap(createGlob(root)) ?? [];
    }

    return [];
  }

  async function readDenoJson(modPath: string) {
    if (await exists(path.join(modPath, "deno.json"))) {
      return JSON.parse(
        await Deno.readTextFile(path.join(modPath, "deno.json")),
      ) as DenoConfig;
    } else if (await exists(path.join(modPath, "deno.jsonc"))) {
      return JSON.parse(
        await Deno.readTextFile(path.join(modPath, "deno.jsonc")),
      ) as DenoConfig;
    }
    return undefined;
  }
}

function printModuleScripts(root: string, modules: ModuleInfo[]) {
  const longest = modules
    .flatMap((info) => [
      ...Object.keys(info.npmScripts ?? []),
      ...Object.keys(info.denoTasks ?? []),
    ])
    .reduce((a, b) => (a.length > b.length ? a : b));

  for (const info of modules) {
    const isUniqueDirname =
      modules.filter((t) => t.shortName === info!.shortName).length === 1;

    const pkgPrefix =
      info.npmScripts && info.denoTasks
        ? "[Mixed] "
        : info.npmScripts
        ? "📦 "
        : info.denoTasks
        ? "🦕 "
        : "";

    if (isUniqueDirname) {
      const relativePath = path.relative(root, info.path);
      const pkgExpr =
        info.pkgName === info.shortName
          ? info.shortName
          : `${info.shortName}${info.pkgName ? ` [${info.pkgName}]` : ""}`;
      console.log(`${pkgPrefix}${pkgExpr} <root>/${relativePath}`);
    } else {
      const relativePath = path.relative(root, info.path);
      console.log(`${pkgPrefix}${relativePath}`);
    }

    const tasks = [
      ...Object.entries(info.npmScripts ?? {}),
      ...Object.entries(info.denoTasks ?? {}),
    ];
    for (const [name, cmd] of tasks) {
      const parentMixed = !!(info.npmScripts && info.denoTasks);
      const taskMixed = !!(info.npmScripts?.[name] && info.denoTasks?.[name]);

      const prefix = taskMixed
        ? "🔥 "
        : info.npmScripts?.[name] && parentMixed
        ? "📦 "
        : info.denoTasks?.[name] && parentMixed
        ? "🦕 "
        : "";
      const suffix = " ".repeat(longest.length - name.length);
      console.log(`  ${prefix}${name}${suffix} $ ${cmd.trim()}`);
    }
  }
}

// run task
async function runTask(ctx: {
  npmClient: string;
  cmd: string;
  mod: ModuleInfo;
  args: string[];
}) {
  Deno.env.set("FORCE_COLOR", "1");
  const mixed = !!(
    ctx.mod.npmScripts?.[ctx.cmd] && ctx.mod.denoTasks?.[ctx.cmd]
  );
  if (mixed) {
    console.error(
      chalk.red("[wsr:err]"),
      `"${ctx.cmd}" is duprecated in both deno.json(c) and package.json`,
    );
    Deno.exit(1);
  }

  if (ctx.mod.npmScripts?.[ctx.cmd]) {
    cd(ctx.mod.path);
    const out = await $`${ctx.npmClient} run ${ctx.cmd} ${ctx.args}`;
    Deno.exit(out.exitCode ?? 0);
  }
  if (ctx.mod.denoTasks?.[ctx.cmd]) {
    cd(ctx.mod.path);
    const out = await $`deno task ${ctx.cmd} ${ctx.args}`;
    Deno.exit(out.exitCode ?? 0);
  }
  console.error(chalk.red(`[wsr:err] task not found ${ctx.cmd}`));
  Deno.exit(1);
}

async function resolveContext(
  cwd: string,
  root: string,
  expr: string,
  cmd: string | undefined,
): Promise<ResolvedContext> {
  const context = await findContextModule(cwd);

  const modules = await getModules(root);
  const matched = modules.find((t) => {
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
  if (matched) {
    return {
      mod: matched,
      cmd: cmd,
    };
  }

  const contextMod = modules.find((t) => t.path === context);
  const rootMod = modules.find((t) => t.root);
  if (contextMod?.npmScripts?.[expr] || contextMod?.denoTasks?.[expr]) {
    return {
      mod: contextMod,
      cmd: expr,
    };
    // cmd = expr;
  } else if (rootMod?.npmScripts?.[expr] || rootMod?.denoTasks?.[expr]) {
    return {
      mod: rootMod,
      cmd: expr,
    };
    // cmd = expr;
  } else {
    console.error(
      chalk.red(`[wsr:err] module or task not found for "${expr}"`),
    );
    Deno.exit(1);
  }
}

// ======== run =========
{
  if (argv.help || argv.h) {
    console.log(HELP);
    Deno.exit(0);
  }

  const root = await findWorkspaceRoot(Deno.cwd());
  if (!root) {
    console.error(chalk.red("[wsr:err] module not found"));
    Deno.exit(1);
  }

  // show tasks without args
  const first = argv._[0];
  if (!first) {
    const modules = await getModules(root);
    printModuleScripts(root, modules);
    Deno.exit(0);
  }

  // resolve with explict task
  const second = argv._[1];
  const resolved = await resolveContext(Deno.cwd(), root, first, second);
  if (!resolved.cmd) {
    printModuleScripts(root, [resolved.mod]);
    Deno.exit(0);
  }

  // run task with cmd
  const npmClient = await getPackageManager(root);
  const passingIdx = Deno.args.findIndex((arg) => arg === "--");
  const args = passingIdx > -1 ? Deno.args.slice(passingIdx + 1) : [];

  await runTask({
    cmd: resolved.cmd,
    mod: resolved.mod,
    npmClient,
    args,
  });
}
