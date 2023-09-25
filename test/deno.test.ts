import { $ } from "npm:zx@7.1.1";
import { cd } from "npm:zx@7.1.1";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.202.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.202.0/path/join.ts";
const cwd = Deno.cwd();

const TEST_FIXTURE = "test/deno-fixture";
const WSR = join(cwd, "wsr.ts");
Deno.test("deno-run", async () => {
  cd(join(cwd, TEST_FIXTURE));
  const out = await $`deno run -A ${WSR} test -r`;
  assert(out.stderr.trim().includes("echo root"));
});

Deno.test("deno-list", async () => {
  cd(join(cwd, TEST_FIXTURE));
  const out = await $`deno run -A ${WSR} -r`.quiet();
  assertEquals(
    out.stdout.trim(),
    `[Mixed] root [node-root] <root>/
  🔥 dup   $ echo dup
  📦 testx $ echo npm-with-deno
  🔥 dup   $ echo dup
  🦕 test  $ echo root
🦕 foo <root>/foo
  test  $ echo foo`,
  );
});

Deno.test("deno child list", async () => {
  cd(join(cwd, TEST_FIXTURE));
  const out = await $`deno run -A ${WSR} foo -r`.quiet();
  assertEquals(
    out.stdout.trim(),
    `🦕 foo <root>/foo
  test $ echo foo`,
  );
});
