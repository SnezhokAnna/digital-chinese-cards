const LESSONS = window.LESSONS || [];
const SELECTED_STORAGE_KEY = "digitalChineseSelected.v1";

const state = {
  lessonId: LESSONS[0].id,
  filter: "all",
  openCards: new Set(),
  mode: "cards",
  testBlocks: [],
  reviewQueue: [],
  reviewIndex: 0,
  reviewRevealed: false,
  reviewAll: false,
  reviewSelectedOnly: false,
  selectedCards: new Set(loadSelectedCards())
};

let chineseVoice = null;
let activeUtterance = null;
let activeAudio = null;

const AUDIO_TEST_MAP = {
  "世纪": "./audio-test/word-shiji.mp3",
  "输入法": "./audio-test/word-shuru-fa.mp3",
  "键盘": "./audio-test/word-jianpan.mp3",
  "发挥作用": "./audio-test/word-fahui-zuoyong.mp3",
  "显示": "./audio-test/word-xianshi.mp3",
  "现在常用的中文输入法有拼音输入法、五笔输入法、手写输入法和语音输入法。": "./audio-test/sentence-input-methods.mp3",
  "你得先安装中文字体和中文输入法。": "./audio-test/sentence-install.mp3"
};

const lessonSelect = document.querySelector("#lessonSelect");
const lessonTitle = document.querySelector("#lessonTitle");
const lessonDescription = document.querySelector("#lessonDescription");
const lessonCount = document.querySelector("#lessonCount");
const cardsGrid = document.querySelector("#cardsGrid");
const phraseGrid = document.querySelector("#phraseGrid");
const phraseNote = document.querySelector("#phraseNote");
const cardTemplate = document.querySelector("#cardTemplate");
const filterButtons = document.querySelectorAll(".filter");
const modeTabs = document.querySelectorAll(".mode-tab");
const cardsMode = document.querySelector("#cardsMode");
const testMode = document.querySelector("#testMode");
const reviewMode = document.querySelector("#reviewMode");
const testStatus = document.querySelector("#testStatus");
const testBlocks = document.querySelector("#testBlocks");
const showAllBtn = document.querySelector("#showAllBtn");
const hideAllBtn = document.querySelector("#hideAllBtn");
const selectionStatus = document.querySelector("#selectionStatus");
const selectVisibleBtn = document.querySelector("#selectVisibleBtn");
const clearSelectedBtn = document.querySelector("#clearSelectedBtn");
const trainSelectedBtn = document.querySelector("#trainSelectedBtn");
const reviewStatus = document.querySelector("#reviewStatus");
const reviewStats = document.querySelector("#reviewStats");
const reviewCard = document.querySelector("#reviewCard");
const reviewCardLabel = document.querySelector("#reviewCardLabel");
const reviewSoundBtn = document.querySelector("#reviewSoundBtn");
const reviewHanzi = document.querySelector("#reviewHanzi");
const reviewAnswer = document.querySelector("#reviewAnswer");
const reviewPinyin = document.querySelector("#reviewPinyin");
const reviewTranslation = document.querySelector("#reviewTranslation");
const reviewExample = document.querySelector("#reviewExample");
const reviewExampleZh = document.querySelector("#reviewExampleZh");
const reviewExampleRu = document.querySelector("#reviewExampleRu");
const reviewRevealBtn = document.querySelector("#reviewRevealBtn");
const reviewGradeActions = document.querySelector("#reviewGradeActions");
const reviewDueBtn = document.querySelector("#reviewDueBtn");
const reviewAllBtn = document.querySelector("#reviewAllBtn");
const reviewSelectedBtn = document.querySelector("#reviewSelectedBtn");
const reviewResetBtn = document.querySelector("#reviewResetBtn");

const REVIEW_STORAGE_KEY = "digitalChineseReview.v1";
const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function setupLessonSelect() {
  lessonSelect.replaceChildren();
  for (const lesson of LESSONS) {
    const option = document.createElement("option");
    option.value = lesson.id;
    option.textContent = lesson.title.replace(/^Урок /, "");
    lessonSelect.append(option);
  }
}

function getActiveLesson() {
  return LESSONS.find((lesson) => lesson.id === state.lessonId) || LESSONS[0];
}

function normalizeWord(rawWord, index) {
  const [hanzi, pinyin, translation, type = "word", posOrDifficulty = "", metaOrDifficulty = "normal", maybeDifficulty = "normal"] = rawWord;
  const sourceText = typeof metaOrDifficulty === "string" && metaOrDifficulty.startsWith("text-")
    ? Number(metaOrDifficulty.replace("text-", ""))
    : 1;
  const difficultyValue = sourceText ? maybeDifficulty : metaOrDifficulty;
  const difficulty = posOrDifficulty === "hard" ? "hard" : difficultyValue;
  const pos = posOrDifficulty === "hard" || !posOrDifficulty
    ? getDefaultPos(type)
    : posOrDifficulty;

  return {
    id: `${state.lessonId}-${index}`,
    selectionId: `${state.lessonId}:word:${hanzi}`,
    hanzi,
    pinyin,
    translation,
    type,
    pos,
    sourceText,
    difficulty,
    example: getExample(hanzi)
  };
}

function normalizePopularPhrase(rawPhrase, index) {
  const [hanzi, pinyin, translation, pos = "словосоч."] = rawPhrase;
  return {
    id: `${state.lessonId}-popular-${index}`,
    selectionId: `${state.lessonId}:phrase:${hanzi}`,
    hanzi,
    pinyin,
    translation,
    type: "phrase",
    pos,
    sourceText: 0,
    difficulty: "normal",
    example: null
  };
}

function getReviewItems() {
  const lesson = getActiveLesson();
  const words = lesson.words.map(normalizeWord).map((word) => ({
    ...word,
    reviewId: word.selectionId
  }));
  const phrases = (window.LESSON_PHRASES?.[lesson.id] || []).map(normalizePopularPhrase).map((word) => ({
    ...word,
    reviewId: word.selectionId
  }));
  return [...words, ...phrases];
}

function loadSelectedCards() {
  try {
    const saved = JSON.parse(localStorage.getItem(SELECTED_STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveSelectedCards() {
  try {
    localStorage.setItem(SELECTED_STORAGE_KEY, JSON.stringify([...state.selectedCards]));
  } catch {
    // Selection still works for the current session if browser storage is unavailable.
  }
}

function isSelected(word) {
  return state.selectedCards.has(word.selectionId);
}

function toggleSelected(word) {
  if (isSelected(word)) state.selectedCards.delete(word.selectionId);
  else state.selectedCards.add(word.selectionId);
  saveSelectedCards();
  render();
}

function updateSelectionStatus() {
  const lessonItems = getReviewItems();
  const lessonSelected = lessonItems.filter((item) => isSelected(item)).length;
  const visibleSelected = getVisibleSelectionItems().filter((item) => isSelected(item)).length;
  selectionStatus.textContent = `Выбрано ${lessonSelected} в уроке, ${visibleSelected} на экране`;
  trainSelectedBtn.disabled = lessonSelected === 0;
  reviewSelectedBtn.disabled = lessonSelected === 0;
}

function selectVisibleCards() {
  for (const word of getVisibleSelectionItems()) {
    state.selectedCards.add(word.selectionId);
  }
  saveSelectedCards();
  render();
}

function clearSelectedForActiveLesson() {
  for (const item of getReviewItems()) {
    state.selectedCards.delete(item.selectionId);
  }
  saveSelectedCards();
  render();
}

function trainSelectedCards() {
  setMode("review");
  startReview(false, true);
}

function getExample(hanzi) {
  const example = window.LESSON_EXAMPLES?.[state.lessonId]?.[hanzi];
  return example ? { zh: example[0], ru: example[1] } : null;
}

function getVisibleWords() {
  const lesson = getActiveLesson();
  const words = lesson.words.map(normalizeWord);

  if (state.filter === "all") return words;
  if (state.filter === "text-1") return words.filter((word) => word.sourceText === 1);
  if (state.filter === "text-2") return words.filter((word) => word.sourceText === 2);
  if (state.filter === "verb") return words.filter((word) => word.pos.includes("глаг."));
  return words.filter((word) => word.type === state.filter);
}

function getVisibleSelectionItems() {
  const lesson = getActiveLesson();
  const popularPhrases = (window.LESSON_PHRASES?.[lesson.id] || []).map(normalizePopularPhrase);
  return [...getVisibleWords(), ...popularPhrases];
}

function render() {
  const lesson = getActiveLesson();
  const visibleWords = getVisibleWords();

  lessonTitle.textContent = lesson.title;
  lessonDescription.textContent = lesson.description;
  lessonCount.textContent = `${lesson.words.length} карточек в уроке`;
  renderCardGrid(cardsGrid, visibleWords, "В этом разделе пока нет карточек.");

  const popularPhrases = (window.LESSON_PHRASES?.[lesson.id] || []).map(normalizePopularPhrase);
  phraseNote.textContent = `${popularPhrases.length} частых сочетаний с лексикой урока для дополнительной тренировки.`;
  renderCardGrid(phraseGrid, popularPhrases, "Для этого урока пока нет дополнительных словосочетаний.");
  updateSelectionStatus();
  renderTest();
}

function renderCardGrid(grid, words, emptyText) {
  grid.replaceChildren();

  if (!words.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyText;
    grid.append(empty);
    return;
  }

  for (const word of words) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    const isOpen = state.openCards.has(word.id);
    const selected = isSelected(word);
    card.classList.toggle("is-open", isOpen);
    card.classList.toggle("is-selected-for-training", selected);
    card.classList.toggle("is-hard", word.difficulty === "hard");
    card.classList.toggle("has-example", Boolean(word.example));
    card.classList.add(getLengthClass(word.hanzi));
    const selectButton = card.querySelector(".select-card");
    selectButton.classList.toggle("is-selected", selected);
    selectButton.setAttribute("aria-pressed", String(selected));
    selectButton.setAttribute("aria-label", selected ? "Убрать слово из тренировки" : "Выбрать слово для тренировки");
    selectButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSelected(word);
    });
    card.querySelector(".hanzi").textContent = word.hanzi;
    card.querySelector(".pinyin").textContent = word.pinyin;
    card.querySelector(".translation").textContent = `(${word.pos}) ${word.translation}`;
    card.querySelector(".example").hidden = !word.example;
    card.querySelector(".example-zh").textContent = word.example?.zh || "";
    card.querySelector(".example-ru").textContent = word.example?.ru || "";
    card.querySelector(".example-sound").hidden = !word.example;
    card.querySelector(".example-sound").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (word.example?.zh) speakChinese(word.example.zh);
    });
    card.querySelector(".card-button").addEventListener("click", (event) => {
      event.preventDefault();
      toggleCard(word.id, card);
    });
    card.querySelector(".card-button").addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleCard(word.id, card);
      }
    });
    card.querySelector(".sound-button").addEventListener("click", () => speakChinese(word.hanzi));
    grid.append(card);
  }
}

function getDefaultPos(type) {
  return type === "phrase" ? "словосоч." : "слово";
}

function getLengthClass(text) {
  const length = Array.from(String(text).replace(/\s+/g, "")).length;
  if (length <= 2) return "hanzi-short";
  if (length <= 4) return "hanzi-medium";
  return "hanzi-long";
}

function toggleCard(id, cardElement) {
  if (state.openCards.has(id)) {
    state.openCards.delete(id);
  } else {
    state.openCards.add(id);
  }
  cardElement.classList.toggle("is-open", state.openCards.has(id));
}

function setAllCards(open) {
  const lesson = getActiveLesson();
  const words = [
    ...getVisibleWords(),
    ...(window.LESSON_PHRASES?.[lesson.id] || []).map(normalizePopularPhrase)
  ];

  for (const word of words) {
    if (open) state.openCards.add(word.id);
    else state.openCards.delete(word.id);
  }

  document.querySelectorAll(".word-card").forEach((card) => {
    card.classList.toggle("is-open", open);
  });
}

function speakChinese(text) {
  const generatedAudio = window.AUDIO_MANIFEST?.[text];
  if (generatedAudio) {
    playAudioFile(generatedAudio);
    return;
  }

  const audioFile = AUDIO_TEST_MAP[text];
  if (audioFile) {
    playAudioFile(audioFile);
    return;
  }

  if (isAndroidDevice()) {
    playOnlineChineseAudio(text);
    return;
  }

  if (!("speechSynthesis" in window)) {
    playOnlineChineseAudio(text);
    return;
  }

  const synth = window.speechSynthesis;
  const voice = getChineseVoice();

  if (synth.paused) synth.resume();
  synth.cancel();

  activeUtterance = new SpeechSynthesisUtterance(text);
  activeUtterance.lang = voice?.lang || "zh-CN";
  activeUtterance.voice = voice || null;
  activeUtterance.rate = 0.82;
  activeUtterance.pitch = 1;
  activeUtterance.volume = 1;
  activeUtterance.onend = () => {
    activeUtterance = null;
  };
  activeUtterance.onerror = () => {
    activeUtterance = null;
    playOnlineChineseAudio(text);
  };

  synth.speak(activeUtterance);
}

function playOnlineChineseAudio(text) {
  if (!text) return;
  const audioFile = AUDIO_TEST_MAP[text];
  if (audioFile) {
    playAudioFile(audioFile);
    return;
  }
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=zh-CN&q=${encodeURIComponent(text)}`;
  playAudioFile(url);
}

function playAudioFile(url) {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  activeAudio = new Audio(url);
  activeAudio.play().catch(() => {
    activeAudio = null;
  });
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
}

function getChineseVoice() {
  if (!("speechSynthesis" in window)) return null;
  if (chineseVoice) return chineseVoice;
  const voices = window.speechSynthesis.getVoices();
  chineseVoice = voices.find((voice) => /zh[-_]?CN/i.test(voice.lang))
    || voices.find((voice) => /^zh/i.test(voice.lang))
    || null;
  return chineseVoice;
}

function setupSpeechVoices() {
  if (!("speechSynthesis" in window)) return;
  getChineseVoice();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    chineseVoice = null;
    getChineseVoice();
  });
}

function warmUpSpeech() {
  if (!("speechSynthesis" in window)) return;
  getChineseVoice();
  window.speechSynthesis.resume();
}

function setMode(mode) {
  state.mode = mode;
  modeTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.mode === mode));
  cardsMode.hidden = mode !== "cards";
  testMode.hidden = mode !== "test";
  reviewMode.hidden = mode !== "review";
  if (mode === "test" && !state.testBlocks.length) resetAllTests();
  if (mode === "review") startReview(false);
}

function resetAllTests() {
  const pool = getActiveLesson().words.map(normalizeWord);
  state.testBlocks = [];

  for (let start = 0; start < pool.length; start += 10) {
    const items = pool.slice(start, start + 10).map((word, index) => ({
      ...word,
      id: `${state.lessonId}-test-${start + index}-${word.hanzi}`
    }));
    state.testBlocks.push(createTestBlock(start / 10, items));
  }

  renderTest();
}

function createTestBlock(index, items) {
  return {
    index,
    items,
    answers: shuffle(items),
    selectedHanzi: null,
    selectedAnswer: null,
    matchedIds: new Set(),
    mistakes: 0
  };
}

function renderTest() {
  if (!testBlocks) return;
  if (!state.testBlocks.length) resetAllTests();

  testBlocks.replaceChildren();

  for (const block of state.testBlocks) {
    const blockElement = document.createElement("section");
    blockElement.className = "test-block";

    const start = block.index * 10 + 1;
    const end = start + block.items.length - 1;
    const matched = block.matchedIds.size;
    const header = document.createElement("div");
    header.className = "test-block-header";
    header.innerHTML = `
      <div>
        <h3>Блок ${block.index + 1}: ${start}-${end}</h3>
        <p>${matched}/${block.items.length} пар, ошибок: ${block.mistakes}</p>
      </div>
    `;
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Сбросить блок";
    resetButton.id = `reset-test-${block.index}`;
    resetButton.addEventListener("click", () => resetTestBlock(block.index));
    header.append(resetButton);

    const board = document.createElement("div");
    board.className = "match-board";
    const hanziColumn = document.createElement("div");
    hanziColumn.className = "match-column";
    const answerColumn = document.createElement("div");
    answerColumn.className = "match-column";

    for (const item of block.items) {
      hanziColumn.append(createMatchButton(block, "hanzi", item));
    }
    for (const item of block.answers) {
      answerColumn.append(createMatchButton(block, "answer", item));
    }

    board.append(hanziColumn, answerColumn);
    blockElement.append(header, board);
    testBlocks.append(blockElement);
  }

  const totalWords = state.testBlocks.reduce((sum, block) => sum + block.items.length, 0);
  const totalMatched = state.testBlocks.reduce((sum, block) => sum + block.matchedIds.size, 0);
  const totalMistakes = state.testBlocks.reduce((sum, block) => sum + block.mistakes, 0);
  testStatus.textContent = `Все слова урока разбиты на ${state.testBlocks.length} блоков: ${totalMatched}/${totalWords} пар, ошибок: ${totalMistakes}.`;
}

function createMatchButton(block, side, item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `match-item ${side === "hanzi" ? "hanzi-choice" : "answer-choice"}`;
  button.textContent = side === "hanzi" ? item.hanzi : item.translation;
  button.disabled = block.matchedIds.has(item.id);
  button.classList.toggle("is-selected", (side === "hanzi" ? block.selectedHanzi : block.selectedAnswer)?.id === item.id);
  button.classList.toggle("is-matched", block.matchedIds.has(item.id));
  button.addEventListener("click", () => selectMatch(block.index, side, item));
  return button;
}

function selectMatch(blockIndex, side, item) {
  const block = state.testBlocks[blockIndex];
  if (!block || block.matchedIds.has(item.id)) return;
  if (side === "hanzi") block.selectedHanzi = item;
  if (side === "answer") block.selectedAnswer = item;

  if (!block.selectedHanzi || !block.selectedAnswer) {
    renderTest();
    return;
  }

  if (block.selectedHanzi.id === block.selectedAnswer.id) {
    block.matchedIds.add(item.id);
    block.selectedHanzi = null;
    block.selectedAnswer = null;
    renderTest();
    return;
  }

  block.mistakes += 1;
  flashWrongSelection(block);
}

function flashWrongSelection(block) {
  renderTest();
  document.querySelectorAll(".match-item.is-selected").forEach((button) => {
    button.classList.add("is-wrong");
  });
  setTimeout(() => {
    block.selectedHanzi = null;
    block.selectedAnswer = null;
    renderTest();
  }, 420);
}

function resetTestBlock(blockIndex) {
  const block = state.testBlocks[blockIndex];
  if (!block) return;
  state.testBlocks[blockIndex] = createTestBlock(block.index, block.items);
  renderTest();
}

function loadReviewProgress() {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveReviewProgress(progress) {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(progress));
}

function getReviewRecord(item, progress) {
  return progress[item.reviewId] || {
    status: "new",
    due: 0,
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0
  };
}

function getReviewLabel(record) {
  if (record.status === "new") return "Новая карточка";
  if (record.status === "learning") return "Учится";
  if (record.status === "relearn") return "Переучивание";
  return `Повторение: интервал ${Math.max(1, Math.round(record.interval || 1))} дн.`;
}

function getReviewStatsData(items, progress) {
  const now = Date.now();
  return items.reduce((stats, item) => {
    const record = getReviewRecord(item, progress);
    if (record.status === "new") stats.new += 1;
    else if (record.due <= now) stats.due += 1;
    else stats.later += 1;
    if (record.status === "review") stats.review += 1;
    if (record.status === "learning" || record.status === "relearn") stats.learning += 1;
    return stats;
  }, { new: 0, due: 0, later: 0, review: 0, learning: 0 });
}

function startReview(includeAll, selectedOnly = false) {
  state.reviewAll = includeAll;
  state.reviewSelectedOnly = selectedOnly;
  state.reviewIndex = 0;
  state.reviewRevealed = false;
  const progress = loadReviewProgress();
  const items = getReviewItems();
  const now = Date.now();
  const dueItems = items.filter((item) => {
    if (selectedOnly) return isSelected(item);
    const record = getReviewRecord(item, progress);
    return includeAll || record.status === "new" || record.due <= now;
  });
  state.reviewQueue = shuffle(dueItems);
  renderReview();
}

function renderReview() {
  if (!reviewMode) return;
  const progress = loadReviewProgress();
  const items = getReviewItems();
  const stats = getReviewStatsData(items, progress);
  const remaining = Math.max(0, state.reviewQueue.length - state.reviewIndex);

  reviewStats.replaceChildren(
    createReviewStat("Новые", stats.new),
    createReviewStat("Сегодня", stats.due),
    createReviewStat("Учится", stats.learning),
    createReviewStat("Позже", stats.later)
  );

  if (!state.reviewQueue.length || state.reviewIndex >= state.reviewQueue.length) {
    reviewStatus.textContent = state.reviewSelectedOnly
      ? "Выбранных слов пока нет. Отметьте слова галочками на странице карточек."
      : state.reviewAll
      ? "Весь урок пройден. Можно начать снова или перейти к другому уроку."
      : "На сегодня всё. Можно повторить весь урок, если хочется закрепить материал.";
    reviewCard.classList.add("is-empty");
    reviewCardLabel.textContent = "Готово";
    reviewHanzi.textContent = "完成";
    reviewAnswer.hidden = false;
    reviewPinyin.textContent = "wánchéng";
    reviewTranslation.textContent = "тренировка завершена";
    reviewExample.hidden = true;
    reviewRevealBtn.hidden = true;
    reviewGradeActions.hidden = true;
    return;
  }

  const item = state.reviewQueue[state.reviewIndex];
  const record = getReviewRecord(item, progress);
  reviewCard.classList.remove("is-empty");
  reviewStatus.textContent = state.reviewSelectedOnly
    ? `${remaining} выбранных карточек в очереди. Оцените ответ после проверки.`
    : `${remaining} карточек в очереди. Оцените ответ после проверки.`;
  reviewCardLabel.textContent = getReviewLabel(record);
  reviewHanzi.textContent = item.hanzi;
  reviewPinyin.textContent = item.pinyin;
  reviewTranslation.textContent = `(${item.pos}) ${item.translation}`;
  reviewAnswer.hidden = !state.reviewRevealed;
  reviewRevealBtn.hidden = state.reviewRevealed;
  reviewGradeActions.hidden = !state.reviewRevealed;
  reviewExample.hidden = !item.example;
  reviewExampleZh.textContent = item.example?.zh || "";
  reviewExampleRu.textContent = item.example?.ru || "";
}

function createReviewStat(label, value) {
  const stat = document.createElement("div");
  stat.className = "review-stat";
  stat.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return stat;
}

function revealReviewAnswer() {
  state.reviewRevealed = true;
  renderReview();
}

function gradeReview(grade) {
  const item = state.reviewQueue[state.reviewIndex];
  if (!item) return;
  const progress = loadReviewProgress();
  const record = getReviewRecord(item, progress);
  progress[item.reviewId] = scheduleReview(record, grade);
  saveReviewProgress(progress);
  state.reviewIndex += 1;
  state.reviewRevealed = false;
  renderReview();
}

function scheduleReview(record, grade) {
  const now = Date.now();
  const next = {
    ...record,
    reps: (record.reps || 0) + 1,
    ease: record.ease || 2.5
  };

  if (grade === "again") {
    next.status = record.status === "review" ? "relearn" : "learning";
    next.due = now + TEN_MINUTES;
    next.interval = 0;
    next.ease = Math.max(1.3, next.ease - 0.2);
    next.lapses = (record.lapses || 0) + (record.status === "review" ? 1 : 0);
    return next;
  }

  if (grade === "hard") {
    next.status = record.status === "new" ? "learning" : "review";
    next.interval = record.status === "review" ? Math.max(1, Math.round((record.interval || 1) * 1.2)) : 0;
    next.due = record.status === "review" ? now + next.interval * DAY : now + THIRTY_MINUTES;
    next.ease = Math.max(1.3, next.ease - 0.15);
    return next;
  }

  if (grade === "easy") {
    next.status = "review";
    next.ease = Math.min(3.5, next.ease + 0.15);
    next.interval = record.status === "new" || !record.interval
      ? 4
      : Math.max(4, Math.round(record.interval * next.ease * 1.3));
    next.due = now + next.interval * DAY;
    return next;
  }

  next.status = "review";
  next.interval = record.status === "new" || !record.interval
    ? 1
    : Math.max(1, Math.round(record.interval * next.ease));
  next.due = now + next.interval * DAY;
  return next;
}

function resetReviewForActiveLesson() {
  const progress = loadReviewProgress();
  for (const item of getReviewItems()) {
    delete progress[item.reviewId];
  }
  saveReviewProgress(progress);
  startReview(false);
}

function shuffle(items) {
  return [...items]
    .map((item) => [Math.random(), item])
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

function setActiveFilter(filter) {
  state.filter = filter;
  filterButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.filter === filter));
}

lessonSelect.addEventListener("change", () => {
  state.lessonId = lessonSelect.value;
  setActiveFilter("all");
  state.openCards.clear();
  resetAllTests();
  state.reviewQueue = [];
  state.reviewIndex = 0;
  state.reviewRevealed = false;
  state.reviewSelectedOnly = false;
  render();
  if (state.mode === "review") startReview(false);
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveFilter(button.dataset.filter);
    render();
  });
});

showAllBtn.addEventListener("click", () => setAllCards(true));
hideAllBtn.addEventListener("click", () => setAllCards(false));
modeTabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
selectVisibleBtn.addEventListener("click", selectVisibleCards);
clearSelectedBtn.addEventListener("click", clearSelectedForActiveLesson);
trainSelectedBtn.addEventListener("click", trainSelectedCards);
reviewDueBtn.addEventListener("click", () => startReview(false));
reviewAllBtn.addEventListener("click", () => startReview(true));
reviewSelectedBtn.addEventListener("click", () => startReview(false, true));
reviewResetBtn.addEventListener("click", resetReviewForActiveLesson);
reviewSoundBtn.addEventListener("click", () => {
  const item = state.reviewQueue[state.reviewIndex];
  if (item) speakChinese(item.hanzi);
});
reviewRevealBtn.addEventListener("click", revealReviewAnswer);
reviewGradeActions.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => gradeReview(button.dataset.grade));
});

setupSpeechVoices();
document.addEventListener("pointerdown", warmUpSpeech, { once: true });
setupLessonSelect();
resetAllTests();
render();
