import { $, cd } from "npm:zx@7.1.1";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.202.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.202.0/path/join.ts";
const cwd = Deno.cwd();

const TEST_FIXTURE = "test/mixed-fixture";

function normalize(str: string) {
  return str.replaceAll(cwd, "<PROJ>").trim();
}

const WSR = join(cwd, "wsr.ts");

Deno.test("node-mixed list", async () => {
  cd(join(cwd, TEST_FIXTURE));
  const out = await $`deno run -A ${WSR}`.quiet();
  assertEquals(
    normalize(out.stdout),
    `📦 foo [@pkg/foo] <root>/packages/foo
  test $ exit 0
📦 root <root>/
  test $ echo 1
🦕 tasks <root>/tasks
  test $ echo deno`,
  );
});

Deno.test("node-mixed deno run", async () => {
  cd(join(cwd, TEST_FIXTURE));
  const out = await $`deno run -A ${WSR} tasks test`.quiet();
  assert(normalize(out.stderr).includes("echo deno"));
});
