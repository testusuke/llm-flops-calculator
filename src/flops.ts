// LLM training FLOPs (standard Transformer, non-gated FFN)
//   M_param = 6L(4d^2 + 2d d_ff) = 24Ld^2 + 12L d d_ff
//   M_attn  = 12LdS
//   M_vocab = 6dV
//   M = M_param + M_attn + M_vocab   (training FLOPs per token)
//   C = MD                           (total training FLOPs)
//   Chinchilla: C ≈ 6ND

export type ModelConfig = {
  name: string
  /** number of Transformer layers */
  L: number
  /** model dimension / hidden size */
  d: number
  /** FFN intermediate size */
  d_ff: number
  /** sequence length */
  S: number
  /** vocabulary size */
  V: number
  /** total number of training tokens */
  D: number
  /** batch size (sequences per batch) */
  B: number
}

export const NUMERIC_KEYS = ['L', 'd', 'd_ff', 'S', 'V', 'D', 'B'] as const
export type NumericKey = (typeof NUMERIC_KEYS)[number]

/** 保存・import された config。欠けている / 不正な値は undefined（フォームでは空欄） */
export type ConfigDraft = { name: string } & Partial<Record<NumericKey, number>>

export type FlopsResult = {
  /** Transformer 部分のパラメータ数 L(4d^2 + 2d d_ff) */
  N_transformer: number
  /** N_transformer + embedding (dV) */
  N: number
  M: number
  termAttnProj: number
  termFfn: number
  termAttn: number
  termVocab: number
  perSequence: number
  perBatch: number
  tokensPerBatch: number
  steps: number
  C: number
  chinchillaC: number
}

export function computeFlops({ L, d, d_ff, S, V, D, B }: ModelConfig): FlopsResult {
  const termAttnProj = 24 * L * d * d
  const termFfn = 12 * L * d * d_ff
  const termAttn = 12 * L * d * S
  const termVocab = 6 * d * V
  const M = termAttnProj + termFfn + termAttn + termVocab
  const N_transformer = L * (4 * d * d + 2 * d * d_ff)
  const N = N_transformer + d * V
  return {
    N_transformer,
    N,
    M,
    termAttnProj,
    termFfn,
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

/** すべての数値が揃っていて正なら ModelConfig を返す */
export function completeConfig(draft: ConfigDraft): ModelConfig | null {
  for (const k of NUMERIC_KEYS) {
    const v = draft[k]
    if (v === undefined || !Number.isFinite(v) || v <= 0) return null
  }
  return draft as ModelConfig
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

/**
 * import / localStorage の JSON を ConfigDraft に変換する。
 * 数値は文字列 ("2T" など) も受け付け、欠けている・不正な値は undefined にする（スキーマ変更に寛容）
 */
export function toConfigDraft(raw: unknown): ConfigDraft {
  if (typeof raw !== 'object' || raw === null) throw new Error('オブジェクトではありません')
  const obj = raw as Record<string, unknown>
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : '無題のモデル'
  const out: ConfigDraft = { name }
  for (const k of NUMERIC_KEYS) {
    const v = obj[k]
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseQuantity(v) : Number.NaN
    if (Number.isFinite(n) && n > 0) out[k] = n
  }
  return out
}

/** 単一 config / config の配列 / { configs: [...] } のいずれかを受け付ける */
export function parseConfigsJson(text: string): ConfigDraft[] {
  const data: unknown = JSON.parse(text)
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { configs?: unknown }).configs)
      ? (data as { configs: unknown[] }).configs
      : [data]
  return list.map(toConfigDraft)
}

export const PRESETS: ModelConfig[] = [
  { name: 'GPT-3 175B', L: 96, d: 12288, d_ff: 49152, S: 2048, V: 50257, D: 300e9, B: 1536 },
  { name: 'Chinchilla 70B', L: 80, d: 8192, d_ff: 32768, S: 2048, V: 32000, D: 1.4e12, B: 1536 },
  { name: 'GPT-3 6.7B', L: 32, d: 4096, d_ff: 16384, S: 2048, V: 50257, D: 300e9, B: 1024 },
  { name: 'GPT-2 small (124M)', L: 12, d: 768, d_ff: 3072, S: 1024, V: 50257, D: 10e9, B: 512 },
]
