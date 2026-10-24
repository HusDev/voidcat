// Shows how many times Voidcat for Mac was downloaded, on the Download buttons. Nothing shows if the count can't load.
fetch("/api/downloads")
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => {
    const n = Number(d && d.mac);
    if (!n) return;
    const text = `${new Intl.NumberFormat("en").format(n)} ${n === 1 ? "download" : "downloads"}`;
    for (const a of document.querySelectorAll('a[href="/download/mac"]')) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = text;
      a.append(count);
    }
  })
  .catch(() => {});
