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
const MAX_REQUEST_CHARS = 2048;
const ATTEMPT_CACHE_SECONDS = 21600;
const RATE_WINDOW_PROPERTY = 'rate:window';
const RATE_WINDOW_SECONDS = 300;
const RATE_WINDOW_LIMIT = 10;
const DAILY_LIMIT = 100;

function doGet() {
  return createResponse_({
    ok: true,
    service: 'JSTQB Drill Slack Relay'
  });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents || '';

    if (!raw || raw.length > MAX_REQUEST_CHARS) {
      throw new Error('Invalid request size');
    }

    const data = JSON.parse(raw);

    if (
      data.source !== EXPECTED_SOURCE ||
      data.event !== 'first_round_completed'
    ) {
      throw new Error('Invalid request');
    }

    if (typeof data.name !== 'string' || typeof data.attemptId !== 'string') {
      throw new Error('Invalid field types');
    }

    const name = sanitizeName_(data.name);
    const attemptId = sanitizeAttemptId_(data.attemptId);
    const correct = data.correct;

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
    console.warn(JSON.stringify({
      event: 'request_rejected',
      reason: String(error.message || error)
    }));

    return createResponse_({
      ok: false,
      error: 'Request rejected'
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
    const now = Date.now();
    let rateState;

    try {
      rateState = JSON.parse(properties.getProperty(RATE_WINDOW_PROPERTY) || '{}');
    } catch (error) {
      rateState = {};
    }

    if (
      !Number.isFinite(rateState.startedAt) ||
      !Number.isInteger(rateState.count) ||
      now - rateState.startedAt >= RATE_WINDOW_SECONDS * 1000
    ) {
      rateState = {startedAt: now, count: 0};
    }

    if (rateState.count >= RATE_WINDOW_LIMIT) {
      throw new Error('Short-term notification limit exceeded');
    }

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
    properties.setProperty(RATE_WINDOW_PROPERTY, JSON.stringify({
      startedAt: rateState.startedAt,
      count: rateState.count + 1
    }));
    cache.put(duplicateKey, '1', ATTEMPT_CACHE_SECONDS);

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
            type: 'plain_text',
            text: '受験者\n' + name
          },
          {
            type: 'plain_text',
            text: '初回結果\n' + correct + '/50問正解'
          },
          {
            type: 'plain_text',
            text: '間違い\n' + incorrect + '問'
          },
          {
            type: 'plain_text',
            text: '完了日時\n' + completedAt
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            text: incorrect === 0
              ? '全問正解です。'
              : 'この後、間違えた問題のみ再実施します。'
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            text: '注意：ブラウザからの自己申告通知で、解答内容をサーバー検証していません。認定・人事評価の唯一の根拠にしないでください。'
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

function sanitizeName_(value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[<>&]/g, function(character) {
      return {'<': '＜', '>': '＞', '&': '＆'}[character];
    })
    .trim();

  return Array.from(normalized).slice(0, 80).join('');
}

function sanitizeAttemptId_(value) {
  const attemptId = String(value || '').trim().slice(0, 100);

  return /^[A-Za-z0-9-]{8,100}$/.test(attemptId) ? attemptId : '';
}

function createResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
