import { $ } from "npm:zx@7.1.1";
import { cd } from "npm:zx@7.1.1";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.202.0/path/join.ts";
const cwd = Deno.cwd();

const TEST_FIXTURE = "test/npm-fixture";
Deno.test("list all tasks", async () => {
  cd(join(cwd, TEST_FIXTURE));
  const out = await $`deno run -A ../../wsr.ts`.quiet();
  assertEquals(
    out.stdout.trim(),
    `📦 bar [@pkg/bar] <root>/packages/bar
  test     $ exit 0
📦 foo [@pkg/foo] <root>/packages/foo
  test     $ exit 0
📦 root [example] <root>/
  test     $ pnpm test:foo && pnpm test:bar
  test:foo $ cd packages/foo && pnpm test
  test:bar $ cd packages/bar && pnpm test`,
  );
});
