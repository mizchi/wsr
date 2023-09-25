# wsrun

context npm scripts helper for workspaces by deno.

```bash
deno install -A wsr.ts
```

## Usage

```bash
$ wsr --help

Usage:
  $ wsr [module] [cmd]
  $ wsr [module-or-moduleCmd-or-rootCmd]

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
```

## Example

```bash
>>> cd fixture

>>> wsr
bar [@pkg/bar] <root>/packages/bar
  test     $ exit 0
foo [@pkg/foo] <root>/packages/foo
  test     $ exit 0
root [example] <root>/
  test     $ pnpm test:foo && pnpm test:bar
  test:foo $ cd packages/foo && pnpm test
  test:bar $ cd packages/bar && pnpm test

>>> wsr foo     
foo [@pkg/foo] <root>/packages/foo
  test $ exit 0

>>> wsr foo test 
$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
$ npm run test

> test
> exit 0

>>> cd packages/foo
$ wsr test
$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
$ npm run test

> test
> exit 0

>>> wsr bar test && wsr test
$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/bar
$ npm run test

> test
> exit 0

$ cd /Users/kotaro.chikuba/mizchi/wsr/fixture/packages/foo
$ npm run test

> test
> exit 0
```

## How it works

- use `packageManager` field in workspace-root's `package.json` to run `<npmClient> run ...`
- require `workspaces` field in workspace-root's `package.json` or `pnpm-workspace.yaml`

## LICENSE

MIT