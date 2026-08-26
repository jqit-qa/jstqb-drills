# Slack通知中継GAS

`Code.gs` は、公開中のJSTQBドリルから初回50問の完了通知を受け取り、Slack Incoming Webhookへ転送します。

## 秘密情報

Slack Incoming Webhook URLをソースコード、公開HTML、GitHubへ記載しないでください。GASの「プロジェクトの設定」にあるスクリプト プロパティへ、次の名前で保存します。

- プロパティ：`SLACK_WEBHOOK_URL`
- 値：Slack Incoming Webhook URL

## デプロイ設定

- 種類：ウェブアプリ
- 次のユーザーとして実行：自分
- アクセスできるユーザー：全員

本番HTMLの `SLACK_NOTIFY_URL` には、デプロイ後に発行される `/exec` URLを設定します。GASのコードを変更した場合は、デプロイを新しいバージョンへ更新してください。

公開ページから呼び出せる中継URLであるため、GAS側では通知内容を固定し、同一受験IDの重複通知抑止と1日100件の上限を設けています。
