# wsr

npm-scripts and deno-tasks runner for workspace

```bash
deno install -A https://raw.githubusercontent.com/mizchi/wsr/main/wsr.ts -f
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
  $ wsr echo -- a b c # passing args to script

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
$ cd /Users/mizchi/mizchi/wsr/fixture/packages/foo
$ npm run test

> test
> exit 0

>>> cd packages/foo
$ wsr test
$ cd /Users/mizchi/mizchi/wsr/fixture/packages/foo
$ npm run test

> test
> exit 0

>>> wsr bar test && wsr test
$ cd /Users/mizchi/mizchi/wsr/fixture/packages/bar
$ npm run test

> test
> exit 0

$ cd /Users/mizchi/mizchi/wsr/fixture/packages/foo
$ npm run test

> test
> exit 0
```

## Mixed Deno-Node support

```bash
$ ls --tree
.
├── deno.jsonc
├── foo
│  └── deno.jsonc
└── package.json

$ cat deno.jsonc  
{
  "tasks": {
    "dup": "echo dup",
    "test": "echo root"
  }
}
$ cat package.json
{
  "name": "node-root",
  "scripts": {
    "dup": "echo dup",
    "testx": "echo npm-with-deno"
  }
}

$ wsr                      
[Mixed] root [node-root] <root>/
  🔥 dup   $ echo dup
  📦 testx $ echo npm-with-deno
  🔥 dup   $ echo dup
  🦕 test  $ echo root
🦕 foo <root>/foo
  test  $ echo foo

$ wsr foo test
Task test echo foo
foo

$ wsr dup     
[wsr:err] "dup" is duprecated in both deno.json(c) and package.json
```

Only support root side exec in deno module

```bash
# mod/deno.jsonc [test]
# deno.jsonc [test, run]
$ wsr ./mod test # ok
$ cd mod && wsr root run # ng
```

## How it works

- use `packageManager` field in workspace-root's `package.json` to run `<npmClient> run ...`
- require `workspaces` field in workspace-root's `package.json` or `pnpm-workspace.yaml`
- glob `**/deno.json(c)`

## TODO

- [ ] deno root
- [ ] Makefile support

## Contirbute

Pass test

```
$ deno task test
$ deno install -A wsr.ts -f
```

## LICENSE

MIT