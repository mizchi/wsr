import { $, cd } from "npm:zx@7.1.1";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.202.0/path/join.ts";

const cwd = Deno.cwd();

const FIXTURE_DIR = "test/pnpm-fixture";

const WSR = join(cwd, "wsr.ts");

function normalize(str: string) {
  return str.replaceAll(cwd, "<PROJ>").trim();
}

Deno.test("list all tasks", async () => {
  cd(join(cwd, FIXTURE_DIR));
  const out = await $`deno run -A ${WSR}`.quiet();
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

Deno.test("list root tasks", async () => {
  cd(join(cwd, FIXTURE_DIR));

  const out = await $`deno run -A ${WSR} root`.quiet();
  assertEquals(
    out.stdout.trim(),
    `📦 root [example] <root>/
  test     $ pnpm test:foo && pnpm test:bar
  test:foo $ cd packages/foo && pnpm test
  test:bar $ cd packages/bar && pnpm test`,
  );
});

Deno.test("list module tasks", async () => {
  cd(join(cwd, FIXTURE_DIR));

  const out = await $`deno run -A ${WSR} foo`.quiet();
  assertEquals(
    out.stdout.trim(),
    `📦 foo [@pkg/foo] <root>/packages/foo
  test $ exit 0`,
  );
});

Deno.test("run child task", async () => {
  cd(join(cwd, FIXTURE_DIR));
  const out = await $`deno run -A ${WSR} foo test`.quiet();
  assertEquals(
    normalize(out.stderr),
    `$ cd <PROJ>/test/pnpm-fixture/packages/foo
$ pnpm run test

> @pkg/foo@ test <PROJ>/test/pnpm-fixture/packages/foo
> exit 0`,
  );
});

Deno.test("run child task from intermediate", async () => {
  cd(join(cwd, FIXTURE_DIR, "packages"));
  const out = await $`deno run -A ${WSR} foo test`.quiet();
  assertEquals(
    normalize(out.stderr),
    `$ cd <PROJ>/test/pnpm-fixture/packages/foo
$ pnpm run test

> @pkg/foo@ test <PROJ>/test/pnpm-fixture/packages/foo
> exit 0`,
  );
});

Deno.test("relative target", async () => {
  cd(join(cwd, FIXTURE_DIR, "packages/foo"));
  const out = await $`deno run -A ${WSR} ../bar test`.quiet();
  assertEquals(
    normalize(out.stderr),
    `$ cd <PROJ>/test/pnpm-fixture/packages/bar
$ pnpm run test

> @pkg/bar@ test <PROJ>/test/pnpm-fixture/packages/bar
> exit 0`,
  );
});

Deno.test("run child task from module", async () => {
  cd(join(cwd, FIXTURE_DIR, "packages/foo"));
  const out = await $`deno run -A ${WSR} foo test`.quiet();
  assertEquals(
    normalize(out.stderr),
    `$ cd <PROJ>/test/pnpm-fixture/packages/foo
$ pnpm run test

> @pkg/foo@ test <PROJ>/test/pnpm-fixture/packages/foo
> exit 0`,
  );
});

Deno.test("run other task from module", async () => {
  cd(join(cwd, FIXTURE_DIR, "packages/foo"));
  const out = await $`deno run -A ${WSR} bar test`.quiet();
  assertEquals(
    normalize(out.stderr),
    `$ cd <PROJ>/test/pnpm-fixture/packages/bar
$ pnpm run test

> @pkg/bar@ test <PROJ>/test/pnpm-fixture/packages/bar
> exit 0`,
  );
});

Deno.test("run self task from module", async () => {
  cd(join(cwd, FIXTURE_DIR, "packages/foo"));
  const out = await $`deno run -A ${WSR} test`.quiet();
  assertEquals(
    normalize(out.stderr),
    `$ cd <PROJ>/test/pnpm-fixture/packages/foo
$ pnpm run test

> @pkg/foo@ test <PROJ>/test/pnpm-fixture/packages/foo
> exit 0`,
  );
});

Deno.test("run root task from module", async () => {
  cd(join(cwd, FIXTURE_DIR, "packages/foo"));
  const out = await $`deno run -A ${WSR} root test`.quiet();
  console.log(normalize(out.stderr));
  assertEquals(
    normalize(out.stderr),
    `$ cd <PROJ>/test/pnpm-fixture
$ pnpm run test

> example@1.0.0 test <PROJ>/test/pnpm-fixture
> pnpm test:foo && pnpm test:bar


> example@1.0.0 test:foo <PROJ>/test/pnpm-fixture
> cd packages/foo && pnpm test


> @pkg/foo@ test <PROJ>/test/pnpm-fixture/packages/foo
> exit 0


> example@1.0.0 test:bar <PROJ>/test/pnpm-fixture
> cd packages/bar && pnpm test


> @pkg/bar@ test <PROJ>/test/pnpm-fixture/packages/bar
> exit 0`,
  );
});
