import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('JSTQB_FL_1-2章_確認ドリル.html', 'utf8');
const markdown = fs.readFileSync('JSTQB_FL_1-2章_4択問題バンク.md', 'utf8');
const gas = fs.readFileSync('gas/Code.gs', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const STORAGE_KEY = 'jstqb-fl-ch1-2-progress-v2';
const LEGACY_STORAGE_KEY = 'jstqb-fl-ch1-2-progress-v1';

assert.ok(script, 'HTML内のscriptを取得できること');
new Function(script);
new Function(gas);

const questions = vm.runInNewContext(
  script.match(/const QUESTIONS = (\[[\s\S]*?\n\]);/)?.[1]
);
const syllabusPages = vm.runInNewContext(
  `(${script.match(/const SYLLABUS_PAGES = (\{[\s\S]*?\n\});/)?.[1]})`
);

assert.equal(questions.length, 50, '問題数が50問であること');
assert.equal(questions.filter(question => question.ch === 1).length, 25);
assert.equal(questions.filter(question => question.ch === 2).length, 25);

const answerCounts = [0, 0, 0, 0];
const answerIndexes = [];
for (const question of questions) {
  assert.equal(question.opts.length, 4, `問${question.id}が4択であること`);
  assert.ok(
    Number.isInteger(question.ans) && question.ans >= 0 && question.ans < 4,
    `問${question.id}の正答indexが有効であること`
  );
  answerCounts[question.ans]++;
  answerIndexes.push(question.ans);
}
assert.deepEqual(answerCounts, [13, 13, 12, 12]);
let sameAnswerRun = 1;
let longestAnswerRun = 1;
for (let index = 1; index < answerIndexes.length; index++) {
  sameAnswerRun = answerIndexes[index] === answerIndexes[index - 1]
    ? sameAnswerRun + 1
    : 1;
  longestAnswerRun = Math.max(longestAnswerRun, sameAnswerRun);
}
assert.ok(longestAnswerRun <= 2, '同じ正答位置が3問以上連続しないこと');
const displayOrderAnswers = Array.from(questions)
  .sort((left, right) =>
    syllabusPages[left.ref] - syllabusPages[right.ref]
    || left.ref.localeCompare(right.ref, undefined, {numeric: true})
    || left.id - right.id
  )
  .map(question => question.ans);
sameAnswerRun = 1;
longestAnswerRun = 1;
for (let index = 1; index < displayOrderAnswers.length; index++) {
  sameAnswerRun = displayOrderAnswers[index] === displayOrderAnswers[index - 1]
    ? sameAnswerRun + 1
    : 1;
  longestAnswerRun = Math.max(longestAnswerRun, sameAnswerRun);
}
assert.ok(
  longestAnswerRun <= 2,
  '実際の出題順でも同じ正答位置が3問以上連続しないこと'
);

const markdownQuestions = new Map();
const markdownLines = markdown.split('\n');
for (let index = 0; index < markdownLines.length; index++) {
  const match = markdownLines[index].match(/^\*\*問(\d+)\.\*\*/);
  if (!match) continue;
  const id = Number(match[1]);
  const options = markdownLines.slice(index + 1, index + 5).map((line, optionIndex) => {
    assert.ok(
      line.startsWith(`- ${'ABCD'[optionIndex]}. `),
      `問${id}のMarkdown選択肢${optionIndex + 1}が存在すること`
    );
    return line.slice(5);
  });
  markdownQuestions.set(id, options);
}
assert.equal(markdownQuestions.size, 50, 'Markdownに50問あること');

const normalize = value => value.normalize('NFKC').replace(/\s+/g, '');
for (const question of questions) {
  const masterOptions = markdownQuestions.get(question.id);
  assert.deepEqual(
    masterOptions.map(normalize),
    Array.from(question.opts, normalize),
    `問${question.id}のHTMLとMarkdownの選択肢が一致すること`
  );
}

const answerRows = new Map();
for (const match of markdown.matchAll(/^\| (\d+) \| ([A-D]) \|/gm)) {
  answerRows.set(Number(match[1]), match[2]);
}
assert.equal(answerRows.size, 50, 'Markdownの解答表が50問分あること');
for (const question of questions) {
  assert.equal(
    answerRows.get(question.id),
    'ABCD'[question.ans],
    `問${question.id}のHTMLと解答表が一致すること`
  );
}

const question46 = questions.find(question => question.id === 46);
assert.ok(question46.opts.includes('テスト担当者個人の経験年数だけ'));
assert.ok(!html.includes('問題バンクの設問数だけ'));
assert.ok(!markdown.includes('問題バンクの設問数だけ'));
assert.ok(!html.includes('hooks.slack.com/services'));

class MockElement {
  constructor() {
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.style = {};
    this.listeners = new Map();
    const classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  trigger(type) {
    this.listeners.get(type)?.();
  }

  querySelectorAll() {
    return [];
  }
}

const elementIds = [
  'start', 'quiz', 'result', 'hdr', 'learnerName', 'readSyllabus',
  'startBtn', 'retryBtn', 'resumePanel', 'resumeSummary', 'resumeHint',
  'resumeBtn', 'clearProgressBtn', 'notifyStatus', 'tot', 'cur', 'fill',
  'prevBtn', 'nextBtn', 'qcard', 'verdict', 'pct', 'frac', 'rmsg',
  'statusbar', 'reviewlist'
];

function createRuntime(storage, confirmations = [], runTimersImmediately = true) {
  const elements = Object.fromEntries(elementIds.map(id => [id, new MockElement()]));
  const requests = [];
  const timers = [];
  const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  const context = {
    console: {warn() {}, error() {}, log() {}},
    document: {getElementById: id => elements[id]},
    localStorage,
    fetch: async (url, options) => {
      requests.push({url, options});
      return {};
    },
    setTimeout: callback => runTimersImmediately ? callback() : timers.push(callback),
    window: {
      matchMedia: () => ({matches: false}),
      crypto: {randomUUID: () => 'attempt-test-id'},
      scrollTo() {},
      confirm: () => confirmations.shift() ?? true
    }
  };
  vm.createContext(context);
  vm.runInContext(
    script + `
      this.__testApi = {
        buildInitialSession,
        saveProgress,
        restoreProgress,
        updateStartState,
        select,
        setActivePosition(index, answer) {
          cur = index;
          answers[index] = answer;
          saveProgress('in_progress');
        },
        setCompletedRound(masteredIds, wrongIds, completedRounds = 1) {
          mastered = new Set(masteredIds);
          lastWrong = wrongIds.map(id => QUESTIONS.find(question => question.id === id));
          roundNumber = completedRounds;
          initialCompletionSent = true;
        },
        finishWithWrongIds(wrongIds) {
          const wrongIdSet = new Set(wrongIds);
          answers = session.map(item =>
            wrongIdSet.has(item.q.id) ? (item.ans + 1) % 4 : item.ans
          );
          finish();
        },
        getState() {
          return {
            sessionIds: session.map(item => item.q.id),
            answers: answers.slice(),
            currentIndex: cur,
            initialQuestionIds: initialQuestions.map(question => question.id),
            masteredIds: [...mastered],
            lastWrongIds: lastWrong.map(question => question.id),
            roundNumber,
            initialCompletionSent,
            initialAttemptId,
            savedProgress,
            view: {
              start: el('start').classList.contains('on'),
              quiz: el('quiz').classList.contains('on'),
              result: el('result').classList.contains('on')
            }
          };
        }
      };
    `,
    context
  );
  return {api: context.__testApi, elements, requests, timers};
}

const pendingAdvanceStorage = new Map();
const pendingAdvance = createRuntime(pendingAdvanceStorage, [], false);
pendingAdvance.elements.learnerName.value = '遷移待ちテスト';
pendingAdvance.elements.readSyllabus.checked = true;
pendingAdvance.elements.startBtn.trigger('click');
pendingAdvance.api.select(1);
const pendingSaved = JSON.parse(pendingAdvanceStorage.get(STORAGE_KEY));
assert.equal(pendingSaved.currentIndex, 0, '自動遷移前の現在位置を保存すること');
assert.equal(pendingSaved.answers[0], 1, '自動遷移前でも選択内容を保存すること');
const pendingReload = createRuntime(pendingAdvanceStorage);
pendingReload.elements.resumeBtn.trigger('click');
assert.equal(pendingReload.api.getState().currentIndex, 0);
assert.equal(pendingReload.elements.nextBtn.style.display, 'inline-block');

const activeStorage = new Map();
const activeVisit = createRuntime(activeStorage);
activeVisit.elements.learnerName.value = '途中保存テスト';
activeVisit.elements.readSyllabus.checked = true;
activeVisit.elements.startBtn.trigger('click');
let activeSaved = JSON.parse(activeStorage.get(STORAGE_KEY));
assert.equal(activeSaved.phase, 'in_progress');
assert.equal(activeSaved.currentIndex, 0);
assert.equal(activeSaved.sessionQuestionIds.length, 50);
assert.equal(activeSaved.answers.filter(answer => answer !== null).length, 0);

activeVisit.api.select(2);
activeSaved = JSON.parse(activeStorage.get(STORAGE_KEY));
assert.equal(activeSaved.currentIndex, 1, '自動遷移後の問題位置を保存すること');
assert.equal(activeSaved.answers[0], 2, '選択内容を保存すること');

const activeReload = createRuntime(activeStorage);
let activeState = activeReload.api.getState();
assert.equal(activeState.currentIndex, 1);
assert.equal(activeState.answers[0], 2);
assert.match(activeReload.elements.resumeSummary.textContent, /Q2から再開/);
assert.equal(activeReload.elements.resumeBtn.textContent, 'Q2から再開');
activeReload.elements.resumeBtn.trigger('click');
activeState = activeReload.api.getState();
assert.equal(activeState.view.quiz, true);
assert.equal(activeState.currentIndex, 1);

activeReload.api.setActivePosition(49, 0);
const lastQuestionReload = createRuntime(activeStorage);
lastQuestionReload.elements.resumeBtn.trigger('click');
assert.equal(lastQuestionReload.elements.nextBtn.style.display, 'inline-block');
assert.equal(lastQuestionReload.elements.nextBtn.textContent, '結果を見る →');
lastQuestionReload.elements.nextBtn.trigger('click');
assert.equal(lastQuestionReload.api.getState().view.result, true);
assert.equal(JSON.parse(activeStorage.get(STORAGE_KEY)).phase, 'result');

const storage = new Map();
const firstVisit = createRuntime(storage);
firstVisit.elements.learnerName.value = 'テスト受講者';
firstVisit.elements.readSyllabus.checked = true;
firstVisit.api.buildInitialSession();
const wrongIds = [3, 8, 21];
const masteredIds = Array.from(questions, question => question.id)
  .filter(id => !wrongIds.includes(id));
firstVisit.api.finishWithWrongIds(wrongIds);
assert.ok(storage.size > 0, '結果到達後の進捗がlocalStorageへ保存されること');
assert.equal(firstVisit.requests.length, 1, '初回50問完了時に通知を1回送ること');

const reloaded = createRuntime(storage);
let restored = reloaded.api.getState();
assert.equal(reloaded.elements.learnerName.value, 'テスト受講者');
assert.deepEqual(Array.from(restored.masteredIds).sort((a, b) => a - b), masteredIds);
assert.deepEqual(
  Array.from(restored.lastWrongIds).sort((a, b) => a - b),
  wrongIds
);
assert.equal(restored.roundNumber, 1);
assert.equal(restored.initialCompletionSent, true);
assert.equal(reloaded.elements.resumePanel.hidden, false);
assert.match(reloaded.elements.resumeSummary.textContent, /残り3問/);

reloaded.elements.learnerName.value = '別の受講者';
reloaded.elements.learnerName.trigger('input');
assert.equal(reloaded.elements.resumeBtn.disabled, true, '別名では再開できないこと');
assert.equal(reloaded.elements.resumeHint.hidden, false);
reloaded.elements.learnerName.value = 'テスト受講者';
reloaded.elements.learnerName.trigger('input');
assert.equal(reloaded.elements.resumeBtn.disabled, false);

reloaded.elements.resumeBtn.trigger('click');
restored = reloaded.api.getState();
assert.deepEqual(Array.from(restored.sessionIds).sort((a, b) => a - b), wrongIds);
assert.equal(restored.roundNumber, 2);
assert.equal(restored.view.quiz, true);
assert.equal(JSON.parse(storage.get(STORAGE_KEY)).phase, 'in_progress');
const retryReload = createRuntime(storage);
assert.match(retryReload.elements.resumeSummary.textContent, /3問中0問回答済み/);
retryReload.elements.resumeBtn.trigger('click');
assert.deepEqual(
  Array.from(retryReload.api.getState().sessionIds).sort((a, b) => a - b),
  wrongIds
);

const freshStartStorage = new Map(storage);
const cancelledFreshStart = createRuntime(freshStartStorage, [false]);
cancelledFreshStart.elements.learnerName.value = '新しい受講者';
cancelledFreshStart.elements.readSyllabus.checked = true;
cancelledFreshStart.elements.startBtn.trigger('click');
assert.ok(freshStartStorage.size > 0, '確認をキャンセルした場合は履歴を残すこと');
assert.equal(cancelledFreshStart.api.getState().view.start, true);

const acceptedFreshStart = createRuntime(freshStartStorage, [true]);
acceptedFreshStart.elements.learnerName.value = '新しい受講者';
acceptedFreshStart.elements.readSyllabus.checked = true;
acceptedFreshStart.elements.startBtn.trigger('click');
assert.equal(
  JSON.parse(freshStartStorage.get(STORAGE_KEY)).phase,
  'in_progress',
  '最初から開始する場合は旧履歴を新しい途中状態へ置き換えること'
);
assert.equal(acceptedFreshStart.api.getState().roundNumber, 1);
assert.equal(acceptedFreshStart.api.getState().view.quiz, true);

const clearRuntime = createRuntime(storage, [true]);
clearRuntime.elements.clearProgressBtn.trigger('click');
assert.equal(storage.size, 0, '履歴削除でlocalStorageが空になること');
assert.equal(clearRuntime.elements.learnerName.value, '');
assert.equal(clearRuntime.elements.readSyllabus.checked, false);
assert.equal(clearRuntime.elements.resumePanel.hidden, true);

const completedStorage = new Map();
const completedFirstVisit = createRuntime(completedStorage);
completedFirstVisit.elements.learnerName.value = '全問正解者';
completedFirstVisit.api.buildInitialSession();
const allQuestionIds = Array.from(questions, question => question.id);
completedFirstVisit.api.setCompletedRound(allQuestionIds, []);
completedFirstVisit.api.saveProgress();
const completedReload = createRuntime(completedStorage);
assert.equal(completedReload.elements.resumeBtn.hidden, true);
assert.match(completedReload.elements.resumeSummary.textContent, /全50問を習得済み/);

const legacyStorage = new Map();
const currentResult = JSON.parse(completedStorage.get(STORAGE_KEY));
const legacyResult = {...currentResult, version: 1};
delete legacyResult.phase;
delete legacyResult.sessionQuestionIds;
delete legacyResult.answers;
delete legacyResult.currentIndex;
legacyStorage.set(LEGACY_STORAGE_KEY, JSON.stringify(legacyResult));
const migratedLegacy = createRuntime(legacyStorage);
assert.equal(legacyStorage.has(LEGACY_STORAGE_KEY), false);
assert.equal(JSON.parse(legacyStorage.get(STORAGE_KEY)).version, 2);
assert.match(migratedLegacy.elements.resumeSummary.textContent, /全50問を習得済み/);

storage.set(STORAGE_KEY, JSON.stringify({version: 2}));
createRuntime(storage);
assert.equal(storage.size, 0, '破損・非互換データを自動削除すること');

const sent = [];
const cache = new Map();
const properties = new Map([
  ['SLACK_WEBHOOK_URL', 'https://example.invalid/webhook']
]);
const gasContext = {
  console,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, value)
    })
  },
  CacheService: {
    getScriptCache: () => ({
      get: key => cache.get(key) || null,
      put: (key, value) => cache.set(key, value)
    })
  },
  LockService: {
    getScriptLock: () => ({waitLock() {}, releaseLock() {}})
  },
  Utilities: {formatDate: () => '2026/08/26 12:00'},
  Session: {getScriptTimeZone: () => 'Asia/Tokyo'},
  UrlFetchApp: {
    fetch: (url, options) => {
      sent.push({url, options});
      return {getResponseCode: () => 200, getContentText: () => 'ok'};
    }
  },
  ContentService: {
    MimeType: {JSON: 'json'},
    createTextOutput: text => ({text, setMimeType() { return this; }})
  }
};
vm.createContext(gasContext);
vm.runInContext(gas + '\nthis.handlePost = doPost;', gasContext);
const request = {
  source: 'jstqb-drill',
  event: 'first_round_completed',
  name: '連携テスト',
  attemptId: 'duplicate-test',
  correct: 42
};
gasContext.handlePost({postData: {contents: JSON.stringify(request)}});
gasContext.handlePost({postData: {contents: JSON.stringify(request)}});
assert.equal(sent.length, 1, '同一受験IDのSlack通知を重複送信しないこと');

console.log('PASS: 問題整合・途中回答復元・結果復元・旧形式移行・削除・Slack重複抑止');
