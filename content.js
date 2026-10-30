let running = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "START_SCRAPE" && !running) scrapeMaps(message.target);
});

async function scrapeMaps(target) {
  running = true;
  const unique = new Map();
  const processedUrls = new Set();
  
  try {
    let query = "";
    try {
      const input = document.querySelector('#searchboxinput');
      if (input && input.value) query = input.value;
    } catch(e) {}
    
    await updateState({ status: "running", progress: 0, message: "Mencari daftar bisnis..." });

    for (let index = 0; index < target && running; index += 1) {
      await updateState({ progress: index, message: `Membaca bisnis ${index + 1} dari ${target}...` });
      
      let feed = await waitForElement(() => findFeed(), 12000);
      let linkToClick = null;
      
      // Try to find an unvisited link, scroll if needed
      for (let attempt = 0; attempt < 20 && running; attempt++) {
         const allLinks = [...feed.querySelectorAll('a[href*="/maps/place/"]')];
         linkToClick = allLinks.find(a => !processedUrls.has(a.href));
         if (linkToClick) break;
         
         feed.scrollTop = feed.scrollHeight;
         feed.dispatchEvent(new Event("scroll", { bubbles: true }));
         await sleep(1000);
      }
      
      if (!linkToClick) {
         break; // No more links found
      }
      
      const url = linkToClick.href;
      processedUrls.add(url);
      
      // Click the link to open detail pane without reloading the page
      linkToClick.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(800);
      linkToClick.click();
      
      let detailPaneOpened = false;
      try {
        const getTitleEl = () => {
           const h1s = [...document.querySelectorAll("h1")];
           return h1s.find(h1 => h1.textContent && !h1.textContent.toLowerCase().includes("hasil") && !h1.textContent.toLowerCase().includes("results"));
        };
        
        await waitForElement(() => getTitleEl(), 9000);
        detailPaneOpened = true;
        await sleep(1500); // Wait for details to populate

        const titleEl = getTitleEl();
        const name = text(titleEl);
        const body = document.body.innerText;
        const rating = text(document.querySelector('[role="img"][aria-label*="star"], [aria-label*="bintang"]')) || extractRating(body);
        const reviews = extractReviews(body);
        
        const phoneLink = document.querySelector('a[href^="tel:"], button[data-item-id^="phone:"]');
        let phone = text(phoneLink);
        if (phoneLink?.dataset?.itemId?.startsWith("phone:")) {
           phone = phoneLink.dataset.itemId.replace("phone:", "");
        } else if (phoneLink?.href?.startsWith("tel:")) {
           phone = decodeURIComponent(phoneLink.href.replace("tel:", ""));
        }
        
        const websiteLink = document.querySelector('a[data-item-id="authority"], a[aria-label*="Website"], a[aria-label*="Situs"]');
        const categoryBtn = document.querySelector('button[jsaction*="category"]');
        const category = text(categoryBtn);
        
        const addressBtn = document.querySelector('button[data-item-id="address"], [aria-label*="Address"], [aria-label*="Alamat"]');
        let address = text(addressBtn);
        if (addressBtn?.ariaLabel) {
           address = addressBtn.ariaLabel.replace(/Alamat:\s*/i, "").replace(/Address:\s*/i, "").trim();
        }

        if (name) {
           unique.set(url, {
            name,
            phone,
            website: websiteLink?.href || "",
            website_status: websiteLink?.href ? "Sudah ada" : "Belum ditemukan",
            rating,
            reviews,
            category,
            address,
            maps_url: url,
            keyword: query,
            collected_at: new Date().toISOString()
          });
        }
      } catch (e) {
        // detail pane failed to load, just skip and go back
      }
      
      await updateState({ results: [...unique.values()], progress: index + 1 });
      
      if (index < target - 1 && running && detailPaneOpened) {
        // Try clicking the UI back button first
        const backBtn = document.querySelector('button[aria-label*="Back" i], button[aria-label*="Kembali" i], button[jsaction*="back" i]');
        if (backBtn) {
            backBtn.click();
        } else {
            history.back();
        }
        await waitForElement(() => findFeed(), 10000);
        await sleep(800);
      }
    }

    await updateState({ status: "done", results: [...unique.values()], progress: unique.size, message: `Selesai: ${unique.size} bisnis ditemukan.` });
  } catch (error) {
    await updateState({ status: "error", message: error.message || "Pencarian gagal." });
  } finally {
    running = false;
  }
}

function findSearchInput() {
  return document.querySelector('#searchboxinput, input[aria-label*="Search" i], input[aria-label*="Telusuri" i], input[placeholder*="Search" i], input[placeholder*="Telusuri" i]');
}

function findFeed() {
  const feedEl = document.querySelector('[role="feed"], div[aria-label*="Results" i], div[aria-label*="Hasil" i]');
  if (feedEl) return feedEl;
  const firstLink = document.querySelector('a[href*="/maps/place/"]');
  if (firstLink) {
    let parent = firstLink.parentElement;
    while (parent && parent !== document.body) {
      if (parent.scrollHeight > parent.clientHeight) return parent;
      parent = parent.parentElement;
    }
  }
  return null;
}

function extractRating(value) {
  return value.match(/([0-5](?:[.,][0-9])?)\s*(?:stars?|bintang)/i)?.[1] || "";
}

function extractReviews(value) {
  return value.match(/\(([\d.,]+)\)\s*(?:reviews?|ulasan)/i)?.[1] || "";
}

function text(element) {
  return element?.textContent?.replace(/[\uE000-\uF8FF]/g, '').trim().replace(/\s+/g, " ") || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForElement(getter, timeout) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const element = getter();
      if (element) return resolve(element);
      if (Date.now() - started > timeout) return reject(new Error("Elemen Google Maps belum ditemukan. Pastikan hasil pencarian sudah tampil."));
      setTimeout(check, 250);
    };
    check();
  });
}

async function updateState(patch) {
  const { state = {} } = await chrome.storage.local.get("state");
  await chrome.storage.local.set({ state: { ...state, ...patch } });
}
