# LLM FLOPs 計算機

Transformer LLM の学習 FLOPs を **1トークン / 1シーケンス / 1バッチ / 学習全体** の単位で見積もる Web アプリです。

## 数式

```
M = 72Ld^2 + 12LdS + 6dV   # 1トークンあたりの学習 FLOPs
C = MD                     # 学習全体の FLOPs
N ≈ 12Ld^2 + dV            # パラメータ数
C ≈ 6ND                    # Chinchilla 近似

1シーケンスあたり = M × S
1バッチあたり     = M × S × B
```

| 変数 | 意味 |
| --- | --- |
| L | Transformer のレイヤー数 |
| d | model dimension / hidden size |
| S | sequence length |
| V | vocabulary size |
| D | 学習トークン総数 |
| B | バッチサイズ（1バッチあたりのシーケンス数） |

## 機能

- プリセット（GPT-3 175B / Chinchilla 70B / Llama 2 7B / GPT-2 small）
- `2T`, `300B`, `1.4e12`, `1,024` のような入力に対応
- config をブラウザ（localStorage）に保存
- JSON で import / export（単体・配列・`{ "configs": [...] }` 形式に対応）

```json
{ "name": "My Model", "L": 32, "d": 4096, "S": 4096, "V": 32000, "D": 2000000000000, "B": 1024 }
```

## 開発

```sh
npm install
npm run dev     # 開発サーバ
npm run build   # dist/ に出力
```

## デプロイ（Cloudflare Pages）

GitHub に push すると Cloudflare Pages が自動でビルド・デプロイします。

1. GitHub にリポジトリを作成して push
2. Cloudflare ダッシュボード → **Workers & Pages** → **Create application** → **Pages** タブ → **Connect to Git**（画面上部が Workers の作成フローになっている場合は Pages 側の導線を選ぶ）
3. リポジトリを選択し、以下を設定
   - Production branch: `main`
   - Framework preset: `React (Vite)`（または None）
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node バージョンは `.node-version`（22）が自動で使われます
4. **Save and Deploy**

以降、`main` への push で本番デプロイ、それ以外のブランチ / PR への push でプレビューデプロイが作られます。
