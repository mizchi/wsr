import { $ } from "npm:zx@7.1.1";
await $`cd test/pnpm-fixture && pnpm install`;
await $`cd test/npm-fixture && npm install`;
await $`deno test -A test/pnpm.test.ts`;
await $`deno test -A test/npm.test.ts`;
await $`deno test -A test/single.test.ts`;
await $`deno test -A test/deno.test.ts`;
await $`deno test -A test/mixed.test.ts`;
