const targetInput = document.querySelector("#target");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const exportCsvButton = document.querySelector("#export-csv");
const exportHtmlButton = document.querySelector("#export-html");
const statusText = document.querySelector("#status");
const countText = document.querySelector("#count");
const statusDot = document.querySelector("#status-dot");
const progressBar = document.querySelector("#progress-bar");
const errorBox = document.querySelector("#error");

startButton.addEventListener("click", async () => {
  clearError();
  const response = await chrome.runtime.sendMessage({ type: "START_SCRAPE", target: Number(targetInput.value) });
  if (!response?.ok) showError(response?.error || "Tidak dapat memulai scrape.");
  else window.close();
});

stopButton.addEventListener("click", () => chrome.runtime.sendMessage({ type: "STOP_SCRAPE" }));

exportCsvButton.addEventListener("click", async () => {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const response = await chrome.runtime.sendMessage({ type: "EXPORT_CSV", results: state.results });
  if (!response?.ok) showError(response?.error || "Export gagal.");
});

exportHtmlButton.addEventListener("click", async () => {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const response = await chrome.runtime.sendMessage({ type: "EXPORT_HTML", results: state.results });
  if (!response?.ok) showError(response?.error || "Export gagal.");
});

function render(state) {
  statusText.textContent = state.message || "Siap digunakan";
  countText.textContent = state.results?.length || 0;
  const percentage = state.target ? Math.min(100, ((state.progress || 0) / state.target) * 100) : 0;
  progressBar.style.width = `${percentage}%`;
  
  if (state.status === "running") {
    statusDot.className = "status-dot running";
  } else if (state.status === "error") {
    statusDot.className = "status-dot error";
  } else if (state.status === "done") {
    statusDot.className = "status-dot done";
  } else {
    statusDot.className = "status-dot";
  }
  
  if (state.target && targetInput.querySelector(`option[value="${state.target}"]`)) {
    targetInput.value = String(state.target);
  }
}

function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
function clearError() { errorBox.hidden = true; }

chrome.runtime.sendMessage({ type: "GET_STATE" }).then(render);
chrome.storage.onChanged.addListener((changes) => { if (changes.state?.newValue) render(changes.state.newValue); });
