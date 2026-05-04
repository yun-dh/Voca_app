const STORAGE_KEY = "three-pass-vocab.words.v1";
const PASS_TARGET = 3;

const QUIZ_MODES = {
  all: { label: "못외운단어" },
  today: { label: "오늘 추가", daysAgo: 0 },
  yesterday: { label: "어제 추가", daysAgo: 1 },
  twoDaysAgo: { label: "그제 추가", daysAgo: 2 },
};

const state = {
  words: [],
  filter: "learning",
  search: "",
  editingId: null,
  quiz: {
    mode: "all",
    running: false,
    queue: [],
    currentId: null,
    locked: false,
    lastOutcome: null,
  },
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  state.words = loadWords();
  bindEvents();
  render();
});

function bindElements() {
  [
    "wordForm",
    "termInput",
    "meaningInput",
    "noteInput",
    "saveWordButton",
    "cancelEdit",
    "formMessage",
    "quizPoolCount",
    "quizEmpty",
    "quizEmptyText",
    "quizActive",
    "queueCount",
    "currentPassState",
    "quizTerm",
    "answerForm",
    "answerInput",
    "submitAnswer",
    "feedback",
    "feedbackText",
    "answerText",
    "acceptAnswer",
    "nextQuestion",
    "showAnswer",
    "passQuestion",
    "endQuiz",
    "totalCount",
    "learningCount",
    "masteredCount",
    "wrongCount",
    "exportWords",
    "importWords",
    "importFile",
    "searchInput",
    "wordList",
    "listSummary",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.wordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addOrUpdateWord();
  });

  document.querySelectorAll("[data-quiz-mode]").forEach((button) => {
    button.addEventListener("click", () => startQuiz(button.dataset.quizMode));
  });
  els.cancelEdit.addEventListener("click", cancelEdit);

  els.answerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.quiz.locked) {
      nextQuestion();
      return;
    }
    submitAnswer();
  });

  els.showAnswer.addEventListener("click", () => {
    if (!state.quiz.locked) {
      revealAnswer();
    }
  });

  els.acceptAnswer.addEventListener("click", acceptLastWrongAsCorrect);
  els.nextQuestion.addEventListener("click", nextQuestion);
  els.passQuestion.addEventListener("click", passQuestion);
  els.endQuiz.addEventListener("click", endQuiz);

  els.exportWords.addEventListener("click", exportWordBackup);
  els.importWords.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", importWordBackup);

  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderWordList();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      renderWordList();
    });
  });

  els.wordList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const word = findWord(button.dataset.id);
    if (!word) return;

    if (button.dataset.action === "edit") {
      startEditWord(word.id);
    }

    if (button.dataset.action === "reset") {
      resetWord(word.id);
    }

    if (button.dataset.action === "delete") {
      deleteWord(word.id);
    }
  });
}

function loadWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeWord).filter((word) => word.term && word.meaning);
  } catch {
    return [];
  }
}

function normalizeWord(word) {
  const now = Date.now();
  return {
    id: String(word.id || createId()),
    term: String(word.term || "").trim(),
    meaning: String(word.meaning || "").trim(),
    note: String(word.note || "").trim(),
    passCount: clampNumber(word.passCount, 0, PASS_TARGET),
    attempts: Math.max(0, Number(word.attempts) || 0),
    correct: Math.max(0, Number(word.correct) || 0),
    wrong: Math.max(0, Number(word.wrong) || 0),
    createdAt: Number(word.createdAt) || now,
    updatedAt: Number(word.updatedAt) || now,
  };
}

function saveWords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.words));
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addOrUpdateWord() {
  const term = els.termInput.value.trim();
  const meaning = els.meaningInput.value.trim();
  const note = els.noteInput.value.trim();

  if (!term || !meaning) {
    setFormMessage("단어와 뜻을 입력하세요.");
    return;
  }

  const editingWord = state.editingId ? findWord(state.editingId) : null;
  const existing = state.words.find(
    (word) => normalizeText(word.term) === normalizeText(term) && word.id !== state.editingId,
  );
  const now = Date.now();

  if (editingWord && existing) {
    setFormMessage("같은 단어가 이미 있습니다.");
    return;
  }

  if (editingWord) {
    editingWord.term = term;
    editingWord.meaning = meaning;
    editingWord.note = note;
    editingWord.updatedAt = now;
    state.editingId = null;
    setFormMessage("수정했습니다.");
  } else if (existing) {
    existing.term = term;
    existing.meaning = meaning;
    existing.note = note;
    existing.passCount = 0;
    existing.updatedAt = now;
    setFormMessage("다시 시험 풀에 넣었습니다.");
  } else {
    state.words.unshift({
      id: createId(),
      term,
      meaning,
      note,
      passCount: 0,
      attempts: 0,
      correct: 0,
      wrong: 0,
      createdAt: now,
      updatedAt: now,
    });
    setFormMessage("저장했습니다.");
  }

  els.wordForm.reset();
  saveWords();
  trimQuizQueue();
  render();
}

function startEditWord(id) {
  const word = findWord(id);
  if (!word) return;

  state.editingId = id;
  els.termInput.value = word.term;
  els.meaningInput.value = word.meaning;
  els.noteInput.value = word.note;
  renderFormMode();

  document.querySelector(".add-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  window.requestAnimationFrame(() => els.termInput.focus());
}

function cancelEdit() {
  state.editingId = null;
  els.wordForm.reset();
  renderFormMode();
  setFormMessage("수정을 취소했습니다.");
}

function setFormMessage(message) {
  els.formMessage.textContent = message;
  window.setTimeout(() => {
    if (els.formMessage.textContent === message) {
      els.formMessage.textContent = "";
    }
  }, 2200);
}

function startQuiz(mode = "all") {
  const quizMode = QUIZ_MODES[mode] ? mode : "all";
  const due = getQuizWords(quizMode);

  state.quiz.mode = quizMode;
  if (due.length === 0) {
    state.quiz.running = false;
    state.quiz.currentId = null;
    renderQuiz();
    return;
  }

  state.quiz.running = true;
  state.quiz.queue = sortDueWords(due).map((word) => word.id);
  state.quiz.currentId = null;
  state.quiz.locked = false;
  state.quiz.lastOutcome = null;
  nextQuestion();
}

function nextQuestion() {
  if (!state.quiz.running) return;

  trimQuizQueue();

  if (state.quiz.queue.length === 0) {
    const due = getQuizWords(state.quiz.mode);
    if (due.length === 0) {
      endQuiz();
      return;
    }
    state.quiz.queue = sortDueWords(due).map((word) => word.id);
  }

  state.quiz.currentId = state.quiz.queue.shift();
  state.quiz.locked = false;
  state.quiz.lastOutcome = null;
  els.answerInput.value = "";
  render();
  window.requestAnimationFrame(() => els.answerInput.focus());
}

function endQuiz() {
  state.quiz.running = false;
  state.quiz.queue = [];
  state.quiz.currentId = null;
  state.quiz.locked = false;
  state.quiz.lastOutcome = null;
  render();
}

function submitAnswer() {
  const current = getCurrentWord();
  if (!current) return;

  const answer = els.answerInput.value.trim();
  if (!answer) {
    els.answerInput.focus();
    return;
  }

  recordAnswer(isAcceptedAnswer(answer, current), "typed");
}

function revealAnswer() {
  const word = getCurrentWord();
  if (!word) return;

  state.quiz.locked = true;
  state.quiz.lastOutcome = { id: word.id, outcome: "revealed", source: "revealed" };
  render();
}

function passQuestion() {
  if (!state.quiz.running || !getCurrentWord()) return;
  nextQuestion();
}

function recordAnswer(isCorrect, source) {
  const word = getCurrentWord();
  if (!word) return;

  word.attempts += 1;
  word.updatedAt = Date.now();

  if (isCorrect) {
    word.correct += 1;
    word.passCount = Math.min(PASS_TARGET, word.passCount + 1);
    state.quiz.lastOutcome = { id: word.id, outcome: "correct", source };
  } else {
    word.wrong += 1;
    state.quiz.lastOutcome = { id: word.id, outcome: "wrong", source };
  }

  state.quiz.locked = true;
  saveWords();
  trimQuizQueue();
  render();
}

function acceptLastWrongAsCorrect() {
  const last = state.quiz.lastOutcome;
  if (!last || last.outcome !== "wrong") return;
  const word = findWord(last.id);
  if (!word) return;

  word.wrong = Math.max(0, word.wrong - 1);
  word.correct += 1;
  word.passCount = Math.min(PASS_TARGET, word.passCount + 1);
  word.updatedAt = Date.now();
  state.quiz.lastOutcome = { id: word.id, outcome: "correct", source: "manual" };
  saveWords();
  trimQuizQueue();
  render();
}

function resetWord(id) {
  const word = findWord(id);
  if (!word) return;
  word.passCount = 0;
  word.updatedAt = Date.now();
  saveWords();
  trimQuizQueue();
  render();
}

function deleteWord(id) {
  const word = findWord(id);
  if (!word) return;
  const ok = window.confirm(`"${word.term}" 단어를 삭제할까요?`);
  if (!ok) return;

  state.words = state.words.filter((item) => item.id !== id);
  state.quiz.queue = state.quiz.queue.filter((itemId) => itemId !== id);
  if (state.quiz.currentId === id) {
    state.quiz.currentId = null;
    if (state.quiz.running) {
      nextQuestion();
      return;
    }
  }
  saveWords();
  render();
}

async function exportWordBackup() {
  const backup = {
    app: "three-pass-vocab",
    version: 1,
    exportedAt: new Date().toISOString(),
    words: state.words,
  };
  const filename = `voca-backup-${formatDateForFile(new Date())}.json`;
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  try {
    const file = new File([blob], filename, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: "단어장 백업" });
      return;
    }
  } catch {
    // Fall through to browser download when file sharing is unavailable.
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importWordBackup(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedWords = parseBackupWords(text);
    const result = mergeImportedWords(importedWords);

    saveWords();
    trimQuizQueue();
    render();
    window.alert(
      `가져오기 완료: ${result.added}개 추가, ${result.updated}개 업데이트, ${result.skipped}개 제외`,
    );
  } catch (error) {
    window.alert(error.message || "가져오기에 실패했습니다.");
  } finally {
    event.target.value = "";
  }
}

function parseBackupWords(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 백업 파일을 읽을 수 없습니다.");
  }

  const words = Array.isArray(parsed) ? parsed : parsed && parsed.words;
  if (!Array.isArray(words)) {
    throw new Error("단어장 백업 파일 형식이 아닙니다.");
  }

  return words.map(normalizeWord).filter((word) => word.term && word.meaning);
}

function mergeImportedWords(importedWords) {
  const result = { added: 0, updated: 0, skipped: 0 };
  const byId = new Map(state.words.map((word) => [word.id, word]));
  const byTerm = new Map(state.words.map((word) => [normalizeText(word.term), word]));

  importedWords.forEach((imported) => {
    const key = normalizeText(imported.term);
    if (!key) {
      result.skipped += 1;
      return;
    }

    const existing = byId.get(imported.id) || byTerm.get(key);
    if (existing) {
      mergeWordRecord(existing, imported);
      byId.set(existing.id, existing);
      byTerm.set(normalizeText(existing.term), existing);
      result.updated += 1;
      return;
    }

    state.words.push(imported);
    byId.set(imported.id, imported);
    byTerm.set(key, imported);
    result.added += 1;
  });

  return result;
}

function mergeWordRecord(existing, imported) {
  existing.term = imported.term || existing.term;
  existing.meaning = imported.meaning || existing.meaning;
  existing.note = imported.note || existing.note;
  existing.passCount = Math.max(existing.passCount, imported.passCount);
  existing.attempts = Math.max(existing.attempts, imported.attempts);
  existing.correct = Math.max(existing.correct, imported.correct);
  existing.wrong = Math.max(existing.wrong, imported.wrong);
  existing.createdAt = Math.min(existing.createdAt, imported.createdAt);
  existing.updatedAt = Math.max(existing.updatedAt, imported.updatedAt);
}

function formatDateForFile(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isAcceptedAnswer(answer, word) {
  const normalizedAnswer = normalizeText(answer);
  return getAnswerCandidates(word.meaning).some(
    (candidate) => normalizeText(candidate) === normalizedAnswer,
  );
}

function getAnswerCandidates(meaning) {
  const values = meaning
    .split(/[,/;|·、，\n]+|(?:\s+또는\s+)|(?:\s+혹은\s+)|(?:\s+및\s+)/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set([meaning.trim(), ...values]));
}

function normalizeText(value) {
  return String(value).trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function getLearningWords() {
  return state.words.filter((word) => word.passCount < PASS_TARGET);
}

function getQuizWords(mode = "all") {
  const learning = getLearningWords();
  const quizMode = QUIZ_MODES[mode] ? mode : "all";
  const daysAgo = QUIZ_MODES[quizMode].daysAgo;

  if (quizMode === "all") {
    return learning.filter((word) => !isRecentQuizWord(word));
  }

  return learning.filter((word) => wasCreatedDaysAgo(word, daysAgo));
}

function isRecentQuizWord(word) {
  return [0, 1, 2].some((daysAgo) => wasCreatedDaysAgo(word, daysAgo));
}

function wasCreatedDaysAgo(word, daysAgo) {
  const createdAt = new Date(word.createdAt);
  if (!Number.isFinite(createdAt.getTime())) return false;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysAgo);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return createdAt >= start && createdAt < end;
}

function getQuizModeLabel(mode = "all") {
  return QUIZ_MODES[mode]?.label || QUIZ_MODES.all.label;
}

function getMasteredWords() {
  return state.words.filter((word) => word.passCount >= PASS_TARGET);
}

function sortDueWords(words) {
  return [...words].sort((a, b) => {
    if (a.passCount !== b.passCount) return a.passCount - b.passCount;
    if (a.wrong !== b.wrong) return b.wrong - a.wrong;
    return a.updatedAt - b.updatedAt;
  });
}

function trimQuizQueue() {
  const activeIds = new Set(getQuizWords(state.quiz.mode).map((word) => word.id));
  state.quiz.queue = state.quiz.queue.filter((id) => activeIds.has(id));
}

function getCurrentWord() {
  return findWord(state.quiz.currentId);
}

function findWord(id) {
  return state.words.find((word) => word.id === id);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function render() {
  renderFormMode();
  renderStats();
  renderQuiz();
  renderWordList();
}

function renderFormMode() {
  if (state.editingId && !findWord(state.editingId)) {
    state.editingId = null;
    els.wordForm.reset();
  }

  const isEditing = Boolean(state.editingId);
  els.saveWordButton.textContent = isEditing ? "수정 저장" : "저장";
  els.cancelEdit.hidden = !isEditing;
}

function renderStats() {
  const learning = getLearningWords();
  const mastered = getMasteredWords();
  const wrongTotal = state.words.reduce((sum, word) => sum + word.wrong, 0);

  els.totalCount.textContent = state.words.length;
  els.learningCount.textContent = learning.length;
  els.masteredCount.textContent = mastered.length;
  els.wrongCount.textContent = wrongTotal;
  els.quizPoolCount.textContent = `미통과 ${learning.length}개 대기`;
  renderQuizStartButtons();
}

function renderQuizStartButtons() {
  document.querySelectorAll("[data-quiz-mode]").forEach((button) => {
    const mode = QUIZ_MODES[button.dataset.quizMode] ? button.dataset.quizMode : "all";
    const count = getQuizWords(mode).length;
    button.disabled = count === 0;
    button.textContent = `${getQuizModeLabel(mode)} (${count})`;
  });
}

function renderQuiz() {
  const learning = getLearningWords();
  const activeWords = getQuizWords(state.quiz.mode);
  const current = getCurrentWord();

  if (!state.quiz.running || !current) {
    els.quizEmpty.hidden = false;
    els.quizActive.hidden = true;
    els.quizEmptyText.textContent =
      learning.length > 0 ? "시험 종류를 선택하세요." : "저장된 시험 단어가 없습니다.";
    return;
  }

  els.quizEmpty.hidden = true;
  els.quizActive.hidden = false;
  els.queueCount.textContent = `${getQuizModeLabel(state.quiz.mode)} ${activeWords.length}개`;
  els.currentPassState.textContent = `통과 ${current.passCount}/${PASS_TARGET}`;
  els.quizTerm.textContent = current.term;
  els.answerInput.disabled = state.quiz.locked;
  els.submitAnswer.disabled = state.quiz.locked;
  els.showAnswer.disabled = state.quiz.locked;
  els.passQuestion.disabled = state.quiz.locked;

  if (state.quiz.locked && state.quiz.lastOutcome) {
    renderFeedback(current);
  } else {
    els.feedback.hidden = true;
  }
}

function renderFeedback(word) {
  const last = state.quiz.lastOutcome;
  const isCorrect = last.outcome === "correct";
  const isRevealed = last.outcome === "revealed";

  els.feedback.hidden = false;
  els.feedback.classList.toggle("is-correct", isCorrect || isRevealed);
  els.answerText.textContent = word.meaning;
  els.acceptAnswer.hidden = isCorrect || isRevealed;

  if (isRevealed) {
    els.feedbackText.textContent = `정답을 확인했습니다. 기록은 바뀌지 않습니다. 현재 ${word.passCount}/${PASS_TARGET}`;
    return;
  }

  if (isCorrect && word.passCount >= PASS_TARGET) {
    els.feedbackText.textContent = "완료되었습니다.";
    return;
  }

  if (isCorrect) {
    els.feedbackText.textContent = `통과했습니다. 현재 ${word.passCount}/${PASS_TARGET}`;
    return;
  }

  els.feedbackText.textContent = `다시 시험에 나옵니다. 현재 ${word.passCount}/${PASS_TARGET}`;
}

function renderWordList() {
  const words = getFilteredWords();
  els.listSummary.textContent = `${words.length}개`;

  if (words.length === 0) {
    els.wordList.innerHTML = `<div class="empty-list">표시할 단어가 없습니다.</div>`;
    return;
  }

  els.wordList.innerHTML = words.map(renderWordItem).join("");
}

function getFilteredWords() {
  const query = normalizeText(state.search);
  return state.words
    .filter((word) => {
      if (state.filter === "learning" && word.passCount >= PASS_TARGET) return false;
      if (state.filter === "mastered" && word.passCount < PASS_TARGET) return false;
      if (!query) return true;
      return (
        normalizeText(word.term).includes(query) ||
        normalizeText(word.meaning).includes(query) ||
        normalizeText(word.note).includes(query)
      );
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

function renderWordItem(word) {
  const isMastered = word.passCount >= PASS_TARGET;
  const statusClass = isMastered ? "done" : word.wrong > 0 ? "warning" : "";
  const note = word.note ? `<p class="word-note">${escapeHtml(word.note)}</p>` : "";

  return `
    <article class="word-item">
      <div class="word-main">
        <h3>${escapeHtml(word.term)}</h3>
        <p>${escapeHtml(word.meaning)}</p>
        ${note}
      </div>
      <div class="word-side">
        <div class="word-stats">
          <span class="status-chip ${statusClass}">통과 ${word.passCount}/${PASS_TARGET}</span>
          <span class="status-chip">정답 ${word.correct}</span>
          <span class="status-chip wrong">오답 ${word.wrong}</span>
        </div>
        <div class="word-actions">
          <button class="secondary-action" data-action="edit" data-id="${word.id}" type="button">수정</button>
          <button class="secondary-action" data-action="reset" data-id="${word.id}" type="button">리셋</button>
          <button class="ghost-action" data-action="delete" data-id="${word.id}" type="button">삭제</button>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
