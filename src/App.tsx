import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  PRESETS,
  computeFlops,
  formatCount,
  formatSI,
  formatSci,
  parseConfigsJson,
  parseQuantity,
  type ModelConfig,
} from './flops.ts'

const STORAGE_KEY = 'llm-flops-calculator:configs'

type FieldKey = 'L' | 'd' | 'S' | 'V' | 'D' | 'B'
type Form = { name: string } & Record<FieldKey, string>

const FIELDS: { key: FieldKey; label: string; hint: string }[] = [
  { key: 'L', label: 'L — レイヤー数', hint: 'Transformer layers' },
  { key: 'd', label: 'd — 隠れ次元', hint: 'model dimension / hidden size' },
  { key: 'S', label: 'S — シーケンス長', hint: 'sequence length' },
  { key: 'V', label: 'V — 語彙サイズ', hint: 'vocabulary size' },
  { key: 'D', label: 'D — 学習トークン数', hint: 'total training tokens（例: 2T, 300B, 1.4e12）' },
  { key: 'B', label: 'B — バッチサイズ', hint: '1 batch あたりのシーケンス数' },
]

function toForm(c: ModelConfig): Form {
  return {
    name: c.name,
    L: String(c.L),
    d: String(c.d),
    S: String(c.S),
    V: String(c.V),
    D: formatCount(c.D, 4).replace(/\.?0+(?=[KMBT]$)/, ''),
    B: String(c.B),
  }
}

function loadSaved(): ModelConfig[] {
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
  const [saved, setSaved] = useState<ModelConfig[]>(loadSaved)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  }, [saved])

  const parsed = useMemo(() => {
    const values = {} as Record<FieldKey, number>
    const errors: Partial<Record<FieldKey, boolean>> = {}
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
                {saved.map((c) => (
                  <li key={c.name}>
                    <button className="link" onClick={() => setForm(toForm(c))} title="読み込む">
                      {c.name}
                    </button>
                    <span className="muted">≈ {formatCount(computeFlops(c).N)} params</span>
                    <button className="icon" onClick={() => remove(c.name)} aria-label={`${c.name} を削除`}>
                      ×
                    </button>
                  </li>
                ))}
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
                  <code>M = 72Ld² + 12LdS + 6dV</code>
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
                  <div className="seg s1" style={{ width: pct(r.termParam) }} />
                  <div className="seg s2" style={{ width: pct(r.termAttn) }} />
                  <div className="seg s3" style={{ width: pct(r.termVocab) }} />
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
                        <code>72Ld²</code>
                      </td>
                      <td>パラメータ依存の計算（Attention projections + FFN）</td>
                      <td className="num">{formatSI(r.termParam)}FLOPs</td>
                      <td className="num">{pct(r.termParam)}</td>
                    </tr>
                    <tr>
                      <td>
                        <i className="dot s2" />
                        <code>12LdS</code>
                      </td>
                      <td>シーケンス長依存の Attention 計算（QKᵀ, Attention × V）</td>
                      <td className="num">{formatSI(r.termAttn)}FLOPs</td>
                      <td className="num">{pct(r.termAttn)}</td>
                    </tr>
                    <tr>
                      <td>
                        <i className="dot s3" />
                        <code>6dV</code>
                      </td>
                      <td>語彙 / embedding・出力層の計算</td>
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
                      <th>パラメータ数 N</th>
                      <td>
                        <code>N ≈ 12Ld² + dV</code>
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
                <pre>{`# LLM training FLOPs
M = 72Ld^2 + 12LdS + 6dV
C = MD

# Equivalent form
N ≈ 12Ld^2 + dV
M ≈ 6N + 12LdS
C ≈ (6N + 12LdS)D

# Chinchilla approximation
C ≈ 6ND

L : Transformer のレイヤー数
d : model dimension / hidden size
S : sequence length
V : vocabulary size
N : モデルのパラメータ数
D : 学習トークン総数
M : 1トークンあたりの学習 FLOPs（forward + backward）
C : 学習全体の FLOPs

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
