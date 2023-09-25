import { $ } from "npm:zx@7.1.1";
import { cd } from "npm:zx@7.1.1";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.202.0/path/join.ts";
const cwd = Deno.cwd();

Deno.test("list all tasks", async () => {
  cd(join(cwd, "fixture"));
  const out = await $`deno run -A ../wsr.ts`.quiet();
  assertEquals(
    out.stdout.trim(),
    `bar [@pkg/bar] <root>/packages/bar
  test     $ exit 0
foo [@pkg/foo] <root>/packages/foo
  test     $ exit 0
root [example] <root>/
  test     $ pnpm test:foo && pnpm test:bar
  test:foo $ cd packages/foo && pnpm test
  test:bar $ cd packages/bar && pnpm test`,
  );
});

Deno.test("list root tasks", async () => {
  cd(join(cwd, "fixture"));

  const out = await $`deno run -A ../wsr.ts root`.quiet();
  assertEquals(
    out.stdout.trim(),
    `root [example] <root>/
  test     $ pnpm test:foo && pnpm test:bar
  test:foo $ cd packages/foo && pnpm test
  test:bar $ cd packages/bar && pnpm test`,
  );
});

Deno.test("list module tasks", async () => {
  cd(join(cwd, "fixture"));

  const out = await $`deno run -A ../wsr.ts foo`.quiet();
  assertEquals(
    out.stdout.trim(),
    `foo [@pkg/foo] <root>/packages/foo
  test $ exit 0`,
  );
});

Deno.test("run child task", async () => {
  cd(join(cwd, "fixture"));
  const out = await $`deno run -A ../wsr.ts foo test`.quiet();
  assertEquals(
    out.stderr.trim(),
    `$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
$ pnpm run test

> @pkg/foo@ test /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
> exit 0`,
  );
});

Deno.test("run child task from intermediate", async () => {
  cd(join(cwd, "fixture/packages"));
  const out = await $`deno run -A ../../wsr.ts foo test`.quiet();
  assertEquals(
    out.stderr.trim(),
    `$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
$ pnpm run test

> @pkg/foo@ test /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
> exit 0`,
  );
});

Deno.test("relative target", async () => {
  cd(join(cwd, "fixture/packages/foo"));
  const out = await $`deno run -A ../../../wsr.ts ../bar test`.quiet();
  assertEquals(
    out.stderr.trim(),
    `$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/bar
$ pnpm run test

> @pkg/bar@ test /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/bar
> exit 0`,
  );
});

Deno.test("run child task from module", async () => {
  cd(join(cwd, "fixture/packages/foo"));
  const out = await $`deno run -A ../../../wsr.ts foo test`.quiet();
  assertEquals(
    out.stderr.trim(),
    `$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
$ pnpm run test

> @pkg/foo@ test /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
> exit 0`,
  );
});

Deno.test("run other task from module", async () => {
  cd(join(cwd, "fixture/packages/foo"));
  const out = await $`deno run -A ../../../wsr.ts bar test`.quiet();
  assertEquals(
    out.stderr.trim(),
    `$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/bar
$ pnpm run test

> @pkg/bar@ test /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/bar
> exit 0`,
  );
});

Deno.test("run self task from module", async () => {
  cd(join(cwd, "fixture/packages/foo"));
  const out = await $`deno run -A ../../../wsr.ts test`.quiet();
  assertEquals(
    out.stderr.trim(),
    `$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
$ pnpm run test

> @pkg/foo@ test /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
> exit 0`,
  );
});

Deno.test("run root task from module", async () => {
  cd(join(cwd, "fixture/packages/foo"));
  const out = await $`deno run -A ../../../wsr.ts root test`.quiet();
  console.log(out.stderr.trim());
  assertEquals(
    out.stderr.trim(),
    `$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture
$ pnpm run test

> example@1.0.0 test /Users/kotaro.chikuba/mizchi/wsr/fixture
> pnpm test:foo && pnpm test:bar


> example@1.0.0 test:foo /Users/kotaro.chikuba/mizchi/wsr/fixture
> cd packages/foo && pnpm test


> @pkg/foo@ test /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
> exit 0


> example@1.0.0 test:bar /Users/kotaro.chikuba/mizchi/wsr/fixture
> cd packages/bar && pnpm test


> @pkg/bar@ test /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/bar
> exit 0`,
  );
});
