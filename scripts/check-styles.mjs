#!/usr/bin/env node
// ------------------------------------------------------------
// check-styles — verifica a organização dos estilos do projeto.
// Regra em docs/CONVENCOES.md (seção 2).
// Falha (exit 1) se:
//   - houver .css fora de src/renderer/src/styles/ (exceto index.css)
//   - algum módulo de styles/ não estiver importado no index.css
//   - algum @import do index.css não existir ou estiver duplicado
//   - a ordem de cascata estiver errada (tokens 1º, responsive último)
// Uso: node scripts/check-styles.mjs  (ou npm run check:styles)
// ------------------------------------------------------------
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src', 'renderer', 'src')
const stylesDir = join(srcDir, 'styles')
const entryFile = join(srcDir, 'index.css')

const errors = []

// 1) .css fora de styles/ (exceto o index.css de entrada)
for (const f of readdirSync(srcDir)) {
  if (f.endsWith('.css') && f !== 'index.css') {
    errors.push(`Arquivo .css fora de styles/: src/renderer/src/${f}`)
  }
}

// 2) módulos presentes em styles/
const modules = readdirSync(stylesDir)
  .filter((f) => f.endsWith('.css'))
  .sort()

// 3) imports declarados no index.css (ex.: "./styles/chat.css")
const entryContent = readFileSync(entryFile, 'utf8')
const imports = [...entryContent.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
const importNames = imports.map((p) => basename(p))

for (const mod of modules) {
  if (!importNames.includes(mod)) {
    errors.push(`Módulo não importado no index.css: styles/${mod}`)
  }
}

const seen = new Set()
for (const imp of imports) {
  const name = basename(imp)
  if (seen.has(name)) {
    errors.push(`Import duplicado no index.css: ${imp}`)
  }
  seen.add(name)
  if (!existsSync(join(srcDir, imp))) {
    errors.push(`Import quebrado no index.css: ${imp} (arquivo não encontrado)`)
  }
}

// 4) ordem de cascata crítica
if (importNames[0] !== 'tokens.css') {
  errors.push('index.css deve importar tokens.css PRIMEIRO (ordem de cascata)')
}
if (importNames[importNames.length - 1] !== 'responsive.css') {
  errors.push('index.css deve importar responsive.css POR ÚLTIMO (media queries)')
}

if (errors.length > 0) {
  console.error('❌ Regra de estilos violada (docs/CONVENCOES.md seção 2):')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(`✅ Estilos organizados: ${modules.length} módulos em styles/, todos importados no index.css.`)
