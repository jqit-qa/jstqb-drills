# JSTQB FL 第1章・第2章 確認ドリル

JSTQB Foundation Level（CTFL v4.0）第1章・第2章を対象とした、新人向け4択ドリルです。

## 公開ファイル

- `index.html`：GitHub Pagesの入口
- `JSTQB_FL_1-2章_確認ドリル.html`：本番ドリル
- `JSTQB_FL_1-2章_4択問題バンク.md`：全50問と解答・解説のマスター

## 学習フロー

1. 公式シラバスの第1章・第2章を読む。
2. 全50問をランダム順で実施する。実施中もシラバスを参照してよい。
3. 初回の50問完了時に、設定済みの場合はSlackへ通知する。
4. 誤答した問題だけをやり直す。
5. 全50問正解になるまで繰り返す。

## 問題を更新するときのルール

準拠シラバスは `JSTQB Foundation Level Version 2023V4.0.J02` です。

シラバス改訂時は、問題文、正答、節番号、解説を再確認してください。問題を変更するときは、問題バンクMarkdownと本番HTML内の `QUESTIONS` 配列を必ず同時に更新します。

## Slack通知

公開HTMLにSlack Incoming Webhookの秘密URLを直接記載しないでください。本番HTMLの `SLACK_NOTIFY_URL` には、Slack認証情報を安全に保持する社内の通知中継URLを指定します。

## GitHub Pages

`main` ブランチの `/(root)` を公開元に設定します。Jekyllによる変換は使用しません。
