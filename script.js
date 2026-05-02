const LESSONS = window.LESSONS || [];

const state = {
  lessonId: LESSONS[0].id,
  filter: "all",
  openCards: new Set(),
  mode: "cards",
  testBlocks: []
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
const testStatus = document.querySelector("#testStatus");
const testBlocks = document.querySelector("#testBlocks");
const showAllBtn = document.querySelector("#showAllBtn");
const hideAllBtn = document.querySelector("#hideAllBtn");

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
    card.classList.toggle("is-open", isOpen);
    card.classList.toggle("is-hard", word.difficulty === "hard");
    card.classList.toggle("has-example", Boolean(word.example));
    card.classList.add(getLengthClass(word.hanzi));
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
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

function setMode(mode) {
  state.mode = mode;
  modeTabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.mode === mode));
  cardsMode.hidden = mode !== "cards";
  testMode.hidden = mode !== "test";
  if (mode === "test" && !state.testBlocks.length) resetAllTests();
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

function shuffle(items) {
  return [...items]
    .map((item) => [Math.random(), item])
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

lessonSelect.addEventListener("change", () => {
  state.lessonId = lessonSelect.value;
  state.openCards.clear();
  resetAllTests();
  render();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  });
});

showAllBtn.addEventListener("click", () => setAllCards(true));
hideAllBtn.addEventListener("click", () => setAllCards(false));
modeTabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));

setupLessonSelect();
resetAllTests();
render();
