// 레포 TS 파일을 typescript.transpileModule 로 CJS 변환해 scratch 에 두고 require 한다.
// '@/…' 경로는 레포 src 기준으로 같은 방식으로 변환한다. 레포는 건드리지 않는다.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

export function makeLoader(repoRoot, outName) {
  const ts = require(join(repoRoot, 'node_modules/typescript'))
  const outRoot = resolve(dirname(fileURLToPath(import.meta.url)), `.build/${outName}`)
  const srcRoot = join(repoRoot, 'src')
  const done = new Set()

  function resolveSource(fromFile, spec) {
    let base
    if (spec.startsWith('@/')) base = join(srcRoot, spec.slice(2))
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
    else return null
    for (const cand of [base + '.ts', base + '.tsx', join(base, 'index.ts')]) if (existsSync(cand)) return cand
    return null
  }

  function build(file) {
    if (done.has(file)) return
    done.add(file)
    const code = readFileSync(file, 'utf8')
    const rel = relative(srcRoot, file).replace(/\.tsx?$/, '.js')
    const outFile = join(outRoot, rel)
    let js = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    js = js.replace(/require\("([^"]+)"\)/g, (m, spec) => {
      const src = resolveSource(file, spec)
      if (!src) {
        if (spec.startsWith('.') || spec.startsWith('@/')) return m
        try {
          return `require(${JSON.stringify(require.resolve(spec, { paths: [repoRoot] }))})`
        } catch {
          return m
        }
      }
      build(src)
      const target = join(outRoot, relative(srcRoot, src).replace(/\.tsx?$/, '.js'))
      let r = relative(dirname(outFile), target).replace(/\\/g, '/')
      if (!r.startsWith('.')) r = './' + r
      return `require("${r}")`
    })
    mkdirSync(dirname(outFile), { recursive: true })
    writeFileSync(outFile, js)
  }

  return function load(srcRelPath) {
    const file = join(srcRoot, srcRelPath)
    build(file)
    return require(join(outRoot, srcRelPath.replace(/\.tsx?$/, '.js')))
  }
}
