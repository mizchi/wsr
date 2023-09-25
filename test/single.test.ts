import { $ } from "npm:zx@7.1.1";
import { cd } from "npm:zx@7.1.1";
import { assertEquals } from "https://deno.land/std@0.202.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.202.0/path/join.ts";
const cwd = Deno.cwd();

const TEST_FIXTURE = "test/single-fixture";

function normalize(str: string) {
  return str.replaceAll(cwd, "<PROJ>").trim();
}

const WSR = join(cwd, "wsr.ts");
Deno.test("run", async () => {
  cd(join(cwd, TEST_FIXTURE));
  const out = await $`deno run -A ${WSR} test -r`.quiet();
  assertEquals(
    normalize(out.stderr),
    `$ cd <PROJ>/test/single-fixture
$ npm run test

> test
> echo 1

1`,
  );
});
