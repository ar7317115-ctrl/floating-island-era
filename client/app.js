const $ = (s) => document.querySelector(s);

const resourceLabels = {
  food: ["🍖 食物", "food"],
  water: ["💧 淡水", "water"],
  wood: ["🪵 木材", "wood"],
  soil: ["🟫 土方", "soil"],
  seeds: ["🌱 种子", "seeds"]
};

function showToast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

async function api(path) {
  const res = await fetch(path, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "操作失败");
  return data;
}

async function getState() {
  const res = await fetch("/api/state", { cache: "no-store" });
  return res.json();
}

function render(state) {
  const stats = [
    ["🗓️ 天数", state.day],
    ["❤️ 健康", Math.round(state.health)],
    ["👥 人口", state.population],
    ["🏝️ 岛屿格数", state.islandTiles],
    ["👤 人物箱", state.inventory.characterBox],
    ["❓ 未知箱", state.inventory.mysteryBox]
  ];

  $("#stats").innerHTML = stats.map(([k,v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join("");

  const resources = Object.entries(resourceLabels).map(([key, [label]]) =>
    `<div class="row"><span>${label}</span><strong>${state.resources[key]}</strong></div>`
  ).join("");

  $("#civilization").innerHTML = `
    ${resources}
    <div class="row"><span>🏠 住所</span><strong>${state.buildings.hut}</strong></div>
    <div class="row"><span>🌾 农田</span><strong>${state.buildings.farm}</strong></div>
    <div class="row"><span>📦 储存棚</span><strong>${state.buildings.storage}</strong></div>
  `;

  $("#characters").innerHTML = state.characters.length
    ? state.characters.map(c => `
      <div class="character">
        <strong>${c.name} · ${c.rarity}</strong>
        <small>${c.role}｜${c.skill}</small>
      </div>
    `).join("")
    : `<div class="character"><small>现在只有你。雾海里也许还有别人。</small></div>`;

  $("#log").innerHTML = state.log.map(item => `<div class="log-item">${item}</div>`).join("");

  $("#protectionLabel").textContent = state.protection.label;
  $("#protectionBar").style.width = `${state.protection.value}%`;
}

async function refresh() {
  render(await getState());
}

document.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  btn.disabled = true;
  try {
    const state = await api(`/api/${action}`);
    render(state);
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("#resetBtn").addEventListener("click", async () => {
  if (!confirm("确定重新开始这个文明吗？")) return;
  render(await api("/api/reset"));
});

refresh();
