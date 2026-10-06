import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  NUMERIC_KEYS,
  PRESETS,
  completeConfig,
  computeFlops,
  formatCount,
  formatSI,
  formatSci,
  parseConfigsJson,
  parseQuantity,
  type ConfigDraft,
  type ModelConfig,
  type NumericKey,
} from './flops.ts'

const STORAGE_KEY = 'llm-flops-calculator:configs'

type Form = { name: string } & Record<NumericKey, string>

const FIELDS: { key: NumericKey; label: string; hint: string }[] = [
  { key: 'L', label: 'L — レイヤー数', hint: 'Transformer layers' },
  { key: 'd', label: 'd — 隠れ次元', hint: 'model dimension / hidden size' },
  { key: 'd_ff', label: 'd_ff — FFN 中間次元', hint: 'FFN intermediate size（通常 4d。gated FFN なら 1.5 倍で換算）' },
  { key: 'S', label: 'S — シーケンス長', hint: 'sequence length' },
  { key: 'V', label: 'V — 語彙サイズ', hint: 'vocabulary size' },
  { key: 'D', label: 'D — 学習トークン数', hint: 'total training tokens（例: 2T, 300B, 1.4e12）' },
  { key: 'B', label: 'B — バッチサイズ', hint: '1 batch あたりのシーケンス数' },
]

/** 欠けている値は空欄にする */
function toForm(c: ConfigDraft): Form {
  const form = { name: c.name } as Form
  for (const k of NUMERIC_KEYS) {
    const v = c[k]
    form[k] = v === undefined ? '' : k === 'D' ? formatCount(v, 4).replace(/\.?0+(?=[KMBT]$)/, '') : String(v)
  }
  return form
}

function loadSaved(): ConfigDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? parseConfigsJson(raw) : []
  } catch {
    return []
  }
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function slug(name: string) {
  return name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'model'
}

function Flops({ value }: { value: number }) {
  return (
    <>
      <span className="big">{formatSI(value)}FLOPs</span>
      <span className="sci">{formatSci(value)}</span>
    </>
  )
}

export default function App() {
  const [form, setForm] = useState<Form>(() => toForm(PRESETS[0]))
  const [saved, setSaved] = useState<ConfigDraft[]>(loadSaved)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  }, [saved])

  const parsed = useMemo(() => {
    const values = {} as Record<NumericKey, number>
    const errors: Partial<Record<NumericKey, boolean>> = {}
    for (const { key } of FIELDS) {
      const v = parseQuantity(form[key])
      values[key] = v
      if (!Number.isFinite(v) || v <= 0) errors[key] = true
    }
    return { values, errors, valid: Object.keys(errors).length === 0 }
  }, [form])

  const config: ModelConfig | null = parsed.valid ? { name: form.name.trim() || '無題のモデル', ...parsed.values } : null
  const r = config ? computeFlops(config) : null

  const notify = (kind: 'ok' | 'error', text: string) => setMessage({ kind, text })

  const save = () => {
    if (!config) return notify('error', '入力値に誤りがあります')
    setSaved((prev) => {
      const i = prev.findIndex((c) => c.name === config.name)
      if (i === -1) return [...prev, config]
      const next = [...prev]
      next[i] = config
      return next
    })
    notify('ok', `「${config.name}」を保存しました`)
  }

  const remove = (name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    setSaved((prev) => prev.filter((c) => c.name !== name))
  }

  const importFile = async (file: File) => {
    try {
      const configs = parseConfigsJson(await file.text())
      setSaved((prev) => {
        const map = new Map(prev.map((c) => [c.name, c]))
        for (const c of configs) map.set(c.name, c)
        return [...map.values()]
      })
      if (configs.length === 1) setForm(toForm(configs[0]))
      notify('ok', `${configs.length} 件の config を import しました`)
    } catch (e) {
      notify('error', `import に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const pct = (x: number) => (r ? `${((x / r.M) * 100).toFixed(1)}%` : '')

  return (
    <div className="app">
      <header>
        <h1>LLM FLOPs 計算機</h1>
        <p className="lead">Transformer の学習に必要な FLOPs を、1トークン・1シーケンス・1バッチ・学習全体の単位で見積もります。</p>
      </header>

      <main>
        <section className="panel">
          <h2>モデル設定</h2>

          <label className="field">
            <span>プリセット</span>
            <select
              value=""
              onChange={(e) => {
                const p = PRESETS.find((c) => c.name === e.target.value)
                if (p) setForm(toForm(p))
              }}
            >
              <option value="">— 選択して読み込み —</option>
              {PRESETS.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>config 名</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>

          {FIELDS.map(({ key, label, hint }) => (
            <label key={key} className={`field ${parsed.errors[key] ? 'invalid' : ''}`}>
              <span>{label}</span>
              <input
                inputMode="decimal"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
              <small>
                {hint}
                {key === 'D' && Number.isFinite(parsed.values.D) && ` = ${formatCount(parsed.values.D)} tokens`}
              </small>
            </label>
          ))}

          <div className="buttons">
            <button className="primary" onClick={save} disabled={!config}>
              保存
            </button>
            <button onClick={() => config && download(`${slug(config.name)}.json`, config)} disabled={!config}>
              JSON export
            </button>
            <button onClick={() => fileInput.current?.click()}>JSON import</button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importFile(f)
                e.target.value = ''
              }}
            />
          </div>
          {message && <p className={`message ${message.kind}`}>{message.text}</p>}

          <h2>保存済み config</h2>
          {saved.length === 0 ? (
            <p className="muted">まだ保存されていません（ブラウザの localStorage に保存されます）</p>
          ) : (
            <>
              <ul className="saved">
                {saved.map((c) => {
                  const full = completeConfig(c)
                  return (
                    <li key={c.name}>
                      <button className="link" onClick={() => setForm(toForm(c))} title="読み込む">
                        {c.name}
                      </button>
                      <span className="muted">{full ? `≈ ${formatCount(computeFlops(full).N)} params` : '未入力あり'}</span>
                      <button className="icon" onClick={() => remove(c.name)} aria-label={`${c.name} を削除`}>
                        ×
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button onClick={() => download('llm-flops-configs.json', saved)}>すべて JSON export</button>
            </>
          )}
        </section>

        <section className="results">
          {!r || !config ? (
            <p className="message error">入力値に誤りがあります。正の数を入力してください。</p>
          ) : (
            <>
              <div className="cards">
                <div className="card">
                  <h3>1 トークンあたり</h3>
                  <Flops value={r.M} />
                  <code>M = 24Ld² + 12Ld·d_ff + 12LdS + 6dV</code>
                </div>
                <div className="card">
                  <h3>1 シーケンスあたり</h3>
                  <Flops value={r.perSequence} />
                  <code>M × S（{formatCount(config.S)} tokens）</code>
                </div>
                <div className="card">
                  <h3>1 バッチあたり</h3>
                  <Flops value={r.perBatch} />
                  <code>
                    M × S × B（{formatCount(r.tokensPerBatch)} tokens）
                  </code>
                </div>
                <div className="card accent">
                  <h3>学習全体</h3>
                  <Flops value={r.C} />
                  <code>C = M × D（{formatCount(config.D)} tokens）</code>
                </div>
              </div>

              <div className="block">
                <h2>M の内訳（1 トークンあたり）</h2>
                <div className="stack" role="img" aria-label="M の内訳">
                  <div className="seg s1" style={{ width: pct(r.termAttnProj) }} />
                  <div className="seg s2" style={{ width: pct(r.termFfn) }} />
                  <div className="seg s3" style={{ width: pct(r.termAttn) }} />
                  <div className="seg s4" style={{ width: pct(r.termVocab) }} />
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>項</th>
                      <th>内容</th>
                      <th className="num">FLOPs</th>
                      <th className="num">割合</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <i className="dot s1" />
                        <code>24Ld²</code>
                      </td>
                      <td>Attention projections（Q, K, V, O: 6 × 4d² / layer）</td>
                      <td className="num">{formatSI(r.termAttnProj)}FLOPs</td>
                      <td className="num">{pct(r.termAttnProj)}</td>
                    </tr>
                    <tr>
                      <td>
                        <i className="dot s2" />
                        <code>12Ld·d_ff</code>
                      </td>
                      <td>FFN（6 × 2d·d_ff / layer）</td>
                      <td className="num">{formatSI(r.termFfn)}FLOPs</td>
                      <td className="num">{pct(r.termFfn)}</td>
                    </tr>
                    <tr>
                      <td>
                        <i className="dot s3" />
                        <code>12LdS</code>
                      </td>
                      <td>シーケンス長依存の Attention 計算（QKᵀ, Attention × V）</td>
                      <td className="num">{formatSI(r.termAttn)}FLOPs</td>
                      <td className="num">{pct(r.termAttn)}</td>
                    </tr>
                    <tr>
                      <td>
                        <i className="dot s4" />
                        <code>6dV</code>
                      </td>
                      <td>出力層の vocabulary projection</td>
                      <td className="num">{formatSI(r.termVocab)}FLOPs</td>
                      <td className="num">{pct(r.termVocab)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="block">
                <h2>その他の指標</h2>
                <table>
                  <tbody>
                    <tr>
                      <th>Transformer パラメータ数</th>
                      <td>
                        <code>N_transformer ≈ L(4d² + 2d·d_ff)</code>
                      </td>
                      <td className="num">
                        {formatCount(r.N_transformer)}
                        <span className="sci">{formatSci(r.N_transformer)}</span>
                      </td>
                    </tr>
                    <tr>
                      <th>パラメータ数 N</th>
                      <td>
                        <code>N ≈ N_transformer + dV</code>
                      </td>
                      <td className="num">
                        {formatCount(r.N)}
                        <span className="sci">{formatSci(r.N)}</span>
                      </td>
                    </tr>
                    <tr>
                      <th>Chinchilla 近似</th>
                      <td>
                        <code>C ≈ 6ND</code>
                      </td>
                      <td className="num">
                        {formatSI(r.chinchillaC)}FLOPs
                        <span className="sci">
                          {formatSci(r.chinchillaC)}（厳密式との差 {(((r.chinchillaC - r.C) / r.C) * 100).toFixed(2)}%）
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th>1 バッチのトークン数</th>
                      <td>
                        <code>S × B</code>
                      </td>
                      <td className="num">{formatCount(r.tokensPerBatch)}</td>
                    </tr>
                    <tr>
                      <th>学習ステップ数</th>
                      <td>
                        <code>D / (S × B)</code>
                      </td>
                      <td className="num">{formatCount(r.steps)} steps</td>
                    </tr>
                    <tr>
                      <th>PF-days</th>
                      <td>
                        <code>C / (10¹⁵ × 86400)</code>
                      </td>
                      <td className="num">{formatCount(r.C / 8.64e19)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <details className="block">
                <summary>使用している数式</summary>
                <pre>{`# Standard Transformer (non-gated FFN)
Attention projection parameters / layer = Q + K + V + O = 4d²
FFN parameters / layer = d × d_ff + d_ff × d = 2d·d_ff
N_transformer ≈ L(4d² + 2d·d_ff)

# Training FLOPs per token (forward + backward ≈ 6 FLOPs / parameter / token)
M_param ≈ 6L(4d² + 2d·d_ff) = 24Ld² + 12Ld·d_ff
M_attn  ≈ 12LdS
M_vocab ≈ 6dV

M ≈ 24Ld² + 12Ld·d_ff + 12LdS + 6dV
C = MD

# Chinchilla approximation（N = N_transformer + dV）
C ≈ 6ND

1シーケンスあたり = M × S
1バッチあたり     = M × S × B`}</pre>
              </details>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
