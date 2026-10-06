// LLM training FLOPs
//   M = 72Ld^2 + 12LdS + 6dV   (training FLOPs per token)
//   C = MD                     (total training FLOPs)
//   N ≈ 12Ld^2 + dV            (parameters)
//   Chinchilla: C ≈ 6ND

export type ModelConfig = {
  name: string
  /** number of Transformer layers */
  L: number
  /** model dimension / hidden size */
  d: number
  /** sequence length */
  S: number
  /** vocabulary size */
  V: number
  /** total number of training tokens */
  D: number
  /** batch size (sequences per batch) */
  B: number
}

export type FlopsResult = {
  N: number
  M: number
  termParam: number
  termAttn: number
  termVocab: number
  perSequence: number
  perBatch: number
  tokensPerBatch: number
  steps: number
  C: number
  chinchillaC: number
}

export function computeFlops({ L, d, S, V, D, B }: ModelConfig): FlopsResult {
  const termParam = 72 * L * d * d
  const termAttn = 12 * L * d * S
  const termVocab = 6 * d * V
  const M = termParam + termAttn + termVocab
  const N = 12 * L * d * d + d * V
  return {
    N,
    M,
    termParam,
    termAttn,
    termVocab,
    perSequence: M * S,
    perBatch: M * S * B,
    tokensPerBatch: S * B,
    steps: D / (S * B),
    C: M * D,
    chinchillaC: 6 * N * D,
  }
}

const SUFFIXES: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  b: 1e9,
  g: 1e9,
  t: 1e12,
  p: 1e15,
}

/** "2T", "300B", "2e12", "1,024" などを数値に変換する。不正なら NaN */
export function parseQuantity(input: string): number {
  const s = input.trim().replace(/[,_\s]/g, '')
  const m = /^([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?)([kmbgtp]?)$/i.exec(s)
  if (!m) return Number.NaN
  return Number(m[1]) * (m[2] ? SUFFIXES[m[2].toLowerCase()] : 1)
}

const SI = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'R', 'Q']

/** 1.23e21 -> "1.23 Z" */
export function formatSI(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0 '
  const exp = Math.min(SI.length - 1, Math.max(0, Math.floor(Math.log10(Math.abs(x)) / 3)))
  return `${(x / 10 ** (exp * 3)).toPrecision(digits)} ${SI[exp]}`
}

/** 1.23e21 -> "1.23 × 10^21" */
export function formatSci(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const exp = Math.floor(Math.log10(Math.abs(x)))
  return `${(x / 10 ** exp).toPrecision(digits)} × 10^${exp}`
}

/** パラメータ数・トークン数向け: 6.74e9 -> "6.74B" */
export function formatCount(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '—'
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  for (const [v, u] of units) {
    if (Math.abs(x) >= v) return `${(x / v).toPrecision(digits)}${u}`
  }
  return x.toLocaleString('ja-JP', { maximumFractionDigits: 2 })
}

const NUMERIC_KEYS = ['L', 'd', 'S', 'V', 'D', 'B'] as const

/** import された JSON を検証して ModelConfig に変換する。数値は文字列 ("2T" など) も受け付ける */
export function toModelConfig(raw: unknown): ModelConfig {
  if (typeof raw !== 'object' || raw === null) throw new Error('オブジェクトではありません')
  const obj = raw as Record<string, unknown>
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : '無題のモデル'
  const out: Partial<ModelConfig> = { name }
  for (const k of NUMERIC_KEYS) {
    const v = obj[k] ?? (k === 'B' ? 1 : undefined)
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseQuantity(v) : Number.NaN
    if (!Number.isFinite(n) || n <= 0) throw new Error(`"${name}" の ${k} が不正です: ${String(v)}`)
    out[k] = n
  }
  return out as ModelConfig
}

/** 単一 config / config の配列 / { configs: [...] } のいずれかを受け付ける */
export function parseConfigsJson(text: string): ModelConfig[] {
  const data: unknown = JSON.parse(text)
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { configs?: unknown }).configs)
      ? (data as { configs: unknown[] }).configs
      : [data]
  return list.map(toModelConfig)
}

export const PRESETS: ModelConfig[] = [
  { name: 'GPT-3 175B', L: 96, d: 12288, S: 2048, V: 50257, D: 300e9, B: 1536 },
  { name: 'Chinchilla 70B', L: 80, d: 8192, S: 2048, V: 32000, D: 1.4e12, B: 1536 },
  { name: 'Llama 2 7B', L: 32, d: 4096, S: 4096, V: 32000, D: 2e12, B: 1024 },
  { name: 'GPT-2 small (124M)', L: 12, d: 768, S: 1024, V: 50257, D: 10e9, B: 512 },
]
