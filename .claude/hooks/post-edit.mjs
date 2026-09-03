/**
 * PostToolUse hook: format, then type-check, whatever Claude just edited.
 *
 * Runs as `node .claude/hooks/post-edit.mjs` with the hook payload on stdin.
 *
 * Both tools are invoked through `process.execPath` and their entry points inside
 * `node_modules`, never through `npm` or `npx`. The hook already runs under Node, so this
 * needs nothing on PATH beyond the `node` that launched it — which matters on Windows, where
 * the shell a hook gets is not the shell you configured.
 *
 * Exit codes are the contract with Claude Code: 0 is silent success, 2 feeds stderr back to
 * Claude as something to fix. Anything else is treated as the hook itself being broken, so
 * missing tooling exits 0 rather than nagging on every edit.
 *
 * Set SAILORS_SKIP_HOOKS=1 to disable both steps for a session.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const REPO = resolve(import.meta.dirname, '..', '..')
const PRETTIER = resolve(REPO, 'node_modules/prettier/bin/prettier.cjs')
const VUE_TSC = resolve(REPO, 'node_modules/vue-tsc/bin/vue-tsc.js')

/**
 * What prettier is allowed to touch. Deliberately not `--ignore-unknown` over everything: the
 * prose in ROADMAP.md is hand-wrapped and is not prettier-formatted, so reflowing it as a side
 * effect of an unrelated edit would bury the real change in a whole-file diff.
 */
const FORMATTABLE = /\.(vue|ts|tsx|mts|cts|js|mjs|cjs|json|css|html)$/

/** Extensions worth handing to vue-tsc. Everything else formats but cannot break the build. */
const TYPED = /\.(vue|ts|tsx|mts|cts)$/

if (process.env.SAILORS_SKIP_HOOKS) process.exit(0)

const raw = await new Promise((done) => {
  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => (buffer += chunk))
  process.stdin.on('end', () => done(buffer))
})

let input
try {
  input = JSON.parse(raw || '{}')
} catch {
  process.exit(0)
}

const toolInput = input.tool_input ?? {}
const candidates = [toolInput.file_path, ...(toolInput.edits ?? []).map((edit) => edit?.file_path)]

const files = [...new Set(candidates.filter(Boolean).map((file) => resolve(REPO, file)))].filter(
  (file) => {
    // Only touch files that are still in the repo and are not build output or dependencies.
    const rel = relative(REPO, file)
    if (rel.startsWith('..') || rel.startsWith('node_modules') || rel.startsWith('dist')) {
      return false
    }
    return existsSync(file)
  },
)

if (files.length === 0) process.exit(0)

// --- 1. Format ---------------------------------------------------------------------------

const toFormat = files.filter((file) => FORMATTABLE.test(file))

if (toFormat.length > 0 && existsSync(PRETTIER)) {
  try {
    execFileSync(process.execPath, [PRETTIER, '--write', ...toFormat], {
      cwd: REPO,
      stdio: 'pipe',
    })
  } catch (error) {
    // A file prettier cannot parse is usually a syntax error the type-check below will
    // describe far better, so say it once, quietly, and carry on.
    process.stderr.write(`prettier could not format the edit:\n${error.stderr ?? error.message}\n`)
  }
}

// --- 2. Type-check -----------------------------------------------------------------------

// vue-tsc is the only correctness gate this project has — there is no ESLint — and template
// type errors inside an SFC are otherwise invisible until a build. `--build` is incremental,
// so this is cheap on every edit after the first.
if (!files.some((file) => TYPED.test(file)) || !existsSync(VUE_TSC)) process.exit(0)

try {
  execFileSync(process.execPath, [VUE_TSC, '--build'], { cwd: REPO, stdio: 'pipe' })
} catch (error) {
  const report = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
  process.stderr.write(`Type-check failed (vue-tsc --build):\n\n${report}\n`)
  process.exit(2)
}
