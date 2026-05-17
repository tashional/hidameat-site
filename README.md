# 飛騨ミート相場サイト

JA飛騨ミートの牛枝肉相場ページから「和牛 / 去勢 / 計 / 加重平均」を抽出して、GitHub Pages で公開する静的サイトです。

## 公開するファイル

- `index.html`: 公開されるサイト本体
- `data.js`: グラフ用データ
- `update_hidameat_site.js`: 最新データを取得して `data.js` を更新するスクリプト
- `.github/workflows/update-data.yml`: 毎週自動更新する GitHub Actions

## GitHub Pages 公開の基本方針

- 公開先は public repository
- Pages の公開元は `main` ブランチの `/(root)`
- 毎週月曜 09:05 JST に GitHub Actions が `data.js` と `hidameat/` を更新

## 初回公開の流れ

1. GitHub で新しい public repository を作る
2. このフォルダの中身をすべてアップロードする
3. Repository の `Settings > Pages` で `Deploy from a branch` を選ぶ
4. Branch を `main`、Folder を `/(root)` にして保存する
5. `Actions` タブで `Update Hidameat Data` を一度手動実行する

## 公開URL

通常は次の形になります。

`https://<GitHubユーザー名>.github.io/<リポジトリ名>/`
