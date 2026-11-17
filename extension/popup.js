// Info popup shown when the toolbar icon is clicked.
const api = typeof browser !== "undefined" ? browser : chrome;

// Set this to "owner/repo" once the GitHub project exists to show "Report a bug".
const GITHUB_REPO = "GPrabhanjana/cue-enhanced-attendance";

const ATTENDANCE_URL = "https://cue.christuniversity.in/main/attendence";
const manifest = api.runtime.getManifest();

document.getElementById("version").textContent = "v" + manifest.version;

function openTab(url) {
  api.tabs.create({ url });
  window.close();
}

document.getElementById("open").addEventListener("click", () => openTab(ATTENDANCE_URL));

const author = document.getElementById("author");
author.addEventListener("click", (e) => { e.preventDefault(); openTab(author.href); });

if (GITHUB_REPO) {
  const bug = document.getElementById("bug");
  const body =
    "**What happened?**\n\n\n**What did you expect?**\n\n\n" +
    "**Page:** Attendance / View Details\n\n" +
    "---\n" +
    `Version: ${manifest.version}\nBrowser: ${navigator.userAgent}\n`;
  const url = `https://github.com/${GITHUB_REPO}/issues/new?` +
    new URLSearchParams({ title: `[v${manifest.version}] `, body }).toString();
  bug.hidden = false;
  bug.href = url;
  bug.addEventListener("click", (e) => { e.preventDefault(); openTab(url); });
}
