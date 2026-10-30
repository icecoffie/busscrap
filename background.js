const DEFAULT_STATE = {
  status: "idle",
  target: 20,
  query: "",
  results: [],
  progress: 0,
  message: "Siap digunakan"
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get("state");
  if (!current.state) await chrome.storage.local.set({ state: DEFAULT_STATE });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_SCRAPE") {
    startScrape(message.target).then(sendResponse);
    return true;
  }

  if (message.type === "GET_STATE") {
    chrome.storage.local.get("state").then(({ state = DEFAULT_STATE }) => sendResponse(state));
    return true;
  }

  if (message.type === "STOP_SCRAPE") {
    chrome.storage.local.get("state").then(({ state = DEFAULT_STATE }) => {
      chrome.storage.local.set({ state: { ...state, status: "stopped", message: "Dihentikan" } });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "EXPORT_CSV") {
    exportCsv(message.results || []).then(sendResponse);
    return true;
  }

  if (message.type === "EXPORT_HTML") {
    exportHtml(message.results || []).then(sendResponse);
    return true;
  }
});

async function startScrape(target) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !isMapsUrl(tab.url)) {
    return { ok: false, error: "Buka Google Maps terlebih dahulu." };
  }

  const state = { ...DEFAULT_STATE, status: "running", query: "", target, message: "Menunggu hasil..." };
  await chrome.storage.local.set({ state });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tab.id, { type: "START_SCRAPE", target });
    return { ok: true };
  } catch {
    return { ok: false, error: "Content script belum siap. Muat ulang tab Google Maps lalu coba lagi." };
  }
}

function isMapsUrl(url = "") {
  return /https:\/\/(www\.)?google\.[^/]+\/maps|https:\/\/maps\.google\.com/.test(url);
}

async function exportCsv(results) {
  if (!results.length) return { ok: false, error: "Belum ada hasil untuk diekspor." };
  const columns = ["name", "phone", "website", "website_status", "rating", "reviews", "category", "address", "maps_url", "keyword", "collected_at"];
  const lines = [columns.join(","), ...results.map((row) => columns.map((column) => csvCell(row[column] || "")).join(","))];
  const url = `data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + lines.join("\n"))}`;
  await chrome.downloads.download({ url, filename: `maps-prospek-${Date.now()}.csv`, saveAs: true });
  return { ok: true };
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

async function exportHtml(results) {
  if (!results.length) return { ok: false, error: "Belum ada hasil untuk diekspor." };
  
  const columns = [
    { key: "name", label: "Nama Bisnis" },
    { key: "phone", label: "No. HP" },
    { key: "website_status", label: "Status Web" },
    { key: "rating", label: "Rating" },
    { key: "reviews", label: "Ulasan" },
    { key: "category", label: "Kategori" },
    { key: "address", label: "Alamat" }
  ];

  let html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hasil Scrape Maps</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 30px; }
        .header { margin-bottom: 25px; }
        .header h1 { margin: 0 0 10px 0; font-size: 24px; color: #0f172a; }
        .header p { margin: 0; color: #64748b; }
        .table-container { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; text-align: left; }
        th, td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        th { background-color: #f1f5f9; font-weight: 600; color: #475569; position: sticky; top: 0; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background-color: #f8fafc; }
        a { color: #2563eb; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .badge.success { background: #dcfce7; color: #166534; }
        .badge.warning { background: #fef08a; color: #854d0e; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Hasil Prospecting Maps</h1>
        <p>Total data: ${results.length} bisnis</p>
    </div>
    <div class="table-container">
        <table>
            <thead>
                <tr>
                    ${columns.map(c => `<th>${c.label}</th>`).join("")}
                    <th>Aksi</th>
                </tr>
            </thead>
            <tbody>
                ${results.map(row => `
                <tr>
                    <td><strong>${row.name}</strong></td>
                    <td>${row.phone ? `<a href="tel:${row.phone}">${row.phone}</a>` : '-'}</td>
                    <td><span class="badge ${row.website ? 'success' : 'warning'}">${row.website_status}</span></td>
                    <td>${row.rating || '-'}</td>
                    <td>${row.reviews || '-'}</td>
                    <td>${row.category || '-'}</td>
                    <td>${row.address || '-'}</td>
                    <td style="white-space: nowrap;">
                        <a href="${row.maps_url}" target="_blank">Buka di Maps &nearr;</a>
                        ${row.website ? `<br><a href="${row.website}" target="_blank" style="margin-top:4px; display:inline-block;">Kunjungi Web &nearr;</a>` : ''}
                    </td>
                </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
</body>
</html>`;

  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await chrome.downloads.download({ url, filename: `maps-prospek-${Date.now()}.html`, saveAs: true });
  return { ok: true };
}
