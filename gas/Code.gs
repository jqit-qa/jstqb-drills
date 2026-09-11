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
const ROUND_CACHE_SECONDS = 21600;
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

    if (data.source !== EXPECTED_SOURCE) {
      throw new Error('Invalid request');
    }

    if (typeof data.name !== 'string' || typeof data.attemptId !== 'string') {
      throw new Error('Invalid field types');
    }

    const name = sanitizeName_(data.name);
    const attemptId = sanitizeAttemptId_(data.attemptId);
    const completion = normalizeCompletion_(data);

    if (!name || !attemptId) {
      throw new Error('Required fields are missing');
    }

    if (!reserveNotification_(attemptId, completion.roundNumber)) {
      return createResponse_({
        ok: true,
        duplicate: true
      });
    }

    sendToSlack_(name, completion);

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

function normalizeCompletion_(data) {
  // 公開HTMLの切り替え中も旧形式の初回通知を受け付ける。
  if (data.event === 'first_round_completed') {
    if (
      !Number.isInteger(data.correct) ||
      data.correct < 0 ||
      data.correct > TOTAL_QUESTIONS
    ) {
      throw new Error('Invalid score');
    }

    return {
      roundNumber: 1,
      roundTotal: TOTAL_QUESTIONS,
      correct: data.correct,
      masteredCount: data.correct,
      allMastered: data.correct === TOTAL_QUESTIONS
    };
  }

  if (data.event !== 'round_completed') {
    throw new Error('Invalid request');
  }

  const completion = {
    roundNumber: data.roundNumber,
    roundTotal: data.roundTotal,
    correct: data.correct,
    masteredCount: data.masteredCount,
    allMastered: data.allMastered
  };
  const integerFields = [
    completion.roundNumber,
    completion.roundTotal,
    completion.correct,
    completion.masteredCount,
    data.total
  ];

  if (
    !integerFields.every(Number.isInteger) ||
    completion.roundNumber < 1 ||
    completion.roundNumber > 100 ||
    completion.roundTotal < 1 ||
    completion.roundTotal > TOTAL_QUESTIONS ||
    completion.correct < 0 ||
    completion.correct > completion.roundTotal ||
    completion.masteredCount < completion.correct ||
    completion.masteredCount > TOTAL_QUESTIONS ||
    data.total !== TOTAL_QUESTIONS ||
    typeof completion.allMastered !== 'boolean' ||
    completion.allMastered !== (completion.masteredCount === TOTAL_QUESTIONS) ||
    (completion.roundNumber === 1 && (
      completion.roundTotal !== TOTAL_QUESTIONS ||
      completion.masteredCount !== completion.correct
    ))
  ) {
    throw new Error('Invalid completion data');
  }

  return completion;
}

function reserveNotification_(attemptId, roundNumber) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const cache = CacheService.getScriptCache();
    const duplicateKey = 'round:' + attemptId + ':' + roundNumber;

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
    cache.put(duplicateKey, '1', ROUND_CACHE_SECONDS);

    return true;
  } finally {
    lock.releaseLock();
  }
}

function sendToSlack_(name, completion) {
  const webhookUrl =
    PropertiesService.getScriptProperties().getProperty(WEBHOOK_PROPERTY);

  if (!webhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL is not configured');
  }

  const incorrect = completion.roundTotal - completion.correct;
  const remaining = TOTAL_QUESTIONS - completion.masteredCount;
  const roundLabel = completion.roundNumber === 1
    ? '初回50問'
    : '誤答やり直し ' + (completion.roundNumber - 1) + '回目';
  const completedAt = Utilities.formatDate(
    new Date(),
    'Asia/Tokyo',
    'yyyy/MM/dd HH:mm'
  );

  const message = {
    text: completion.allMastered
      ? '<!channel> JSTQBドリルが全問正解で完了しました。設計課題の展開をお願いします！'
      : 'JSTQBドリルの' + roundLabel + 'が完了しました',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: completion.allMastered
            ? 'JSTQBドリル 全問習得通知'
            : 'JSTQBドリル ラウンド完了通知'
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
            text: '実施ラウンド\n' + roundLabel
          },
          {
            type: 'plain_text',
            text: '今回の結果\n' + completion.correct + '/' + completion.roundTotal + '問正解'
          },
          {
            type: 'plain_text',
            text: '累計習得\n' + completion.masteredCount + '/50問'
          },
          {
            type: 'plain_text',
            text: '残り\n' + remaining + '問'
          },
          {
            type: 'plain_text',
            text: '今回の間違い\n' + incorrect + '問'
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
            text: completion.allMastered
              ? '全50問を習得しました。'
              : 'この後、間違えた問題のみ再実施します。'
          }
        ]
      }
    ]
  };

  if (completion.allMastered) {
    message.blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '<!channel>\n*JSTQBドリルが完了しましたので、設計課題の展開をお願いします！*'
      }
    });
  }

  message.blocks.push(
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            text: '注意：ブラウザからの自己申告通知で、解答内容をサーバー検証していません。認定・人事評価の唯一の根拠にしないでください。'
          }
        ]
      }
  );

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
