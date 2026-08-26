/**
 * JSTQB Drill Slack Relay
 * GitHub Pagesから完了通知を受け取り、Slackへ転送する。
 *
 * Slack Webhook URLはコードに記載せず、スクリプト プロパティの
 * SLACK_WEBHOOK_URL に保存する。
 */

const WEBHOOK_PROPERTY = 'SLACK_WEBHOOK_URL';
const EXPECTED_SOURCE = 'jstqb-drill';
const TOTAL_QUESTIONS = 50;
const DAILY_LIMIT = 100;

function doGet() {
  return createResponse_({
    ok: true,
    service: 'JSTQB Drill Slack Relay'
  });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');

    if (
      data.source !== EXPECTED_SOURCE ||
      data.event !== 'first_round_completed'
    ) {
      throw new Error('Invalid request');
    }

    const name = sanitize_(data.name, 80);
    const attemptId = sanitize_(data.attemptId, 100);
    const correct = Number(data.correct);

    if (!name || !attemptId) {
      throw new Error('Required fields are missing');
    }

    if (
      !Number.isInteger(correct) ||
      correct < 0 ||
      correct > TOTAL_QUESTIONS
    ) {
      throw new Error('Invalid score');
    }

    if (!reserveNotification_(attemptId)) {
      return createResponse_({
        ok: true,
        duplicate: true
      });
    }

    sendToSlack_(name, correct);

    return createResponse_({ok: true});
  } catch (error) {
    console.error(error);

    return createResponse_({
      ok: false,
      error: String(error.message || error)
    });
  }
}

function reserveNotification_(attemptId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const cache = CacheService.getScriptCache();
    const duplicateKey = 'attempt:' + attemptId;

    if (cache.get(duplicateKey)) {
      return false;
    }

    const properties = PropertiesService.getScriptProperties();
    const dateKey =
      'daily:' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyy-MM-dd'
      );

    const count = Number(properties.getProperty(dateKey) || 0);

    if (count >= DAILY_LIMIT) {
      throw new Error('Daily notification limit exceeded');
    }

    properties.setProperty(dateKey, String(count + 1));
    cache.put(duplicateKey, '1', 21600);

    return true;
  } finally {
    lock.releaseLock();
  }
}

function sendToSlack_(name, correct) {
  const webhookUrl =
    PropertiesService.getScriptProperties().getProperty(WEBHOOK_PROPERTY);

  if (!webhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL is not configured');
  }

  const incorrect = TOTAL_QUESTIONS - correct;
  const completedAt = Utilities.formatDate(
    new Date(),
    'Asia/Tokyo',
    'yyyy/MM/dd HH:mm'
  );

  const message = {
    text: 'JSTQBドリルの初回50問が完了しました',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'JSTQBドリル 完了通知'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: '*受験者*\n' + escapeSlack_(name)
          },
          {
            type: 'mrkdwn',
            text: '*初回結果*\n' + correct + '/50問正解'
          },
          {
            type: 'mrkdwn',
            text: '*間違い*\n' + incorrect + '問'
          },
          {
            type: 'mrkdwn',
            text: '*完了日時*\n' + completedAt
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: incorrect === 0
              ? '全問正解です。'
              : 'この後、間違えた問題のみ再実施します。'
          }
        ]
      }
    ]
  };

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(message),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(
      'Slack returned HTTP ' + status + ': ' + response.getContentText()
    );
  }
}

function sanitize_(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function escapeSlack_(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
