const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const clientDir = path.join(__dirname, "..", "client");

const characterPool = [
  { id: "luban", name: "鲁班", role: "工程师", rarity: "传说", skill: "百工之祖：建造木材消耗降低 20%" },
  { id: "lbing", name: "李冰", role: "水利师", rarity: "传说", skill: "治水：淡水产出提高 25%" },
  { id: "xuxiake", name: "徐霞客", role: "探索者", rarity: "史诗", skill: "万里行：迷雾探索效率提高 30%" },
  { id: "huatuo", name: "华佗", role: "医师", rarity: "传说", skill: "青囊：伤病恢复速度提高 35%" },
  { id: "zuchongzhi", name: "祖冲之", role: "数学家", rarity: "史诗", skill: "精算：研究与建造效率提高 15%" }
];

function newGame() {
  return {
    day: 1,
    actionCount: 0,
    resources: {
      food: 8,
      water: 8,
      wood: 2,
      soil: 0,
      seeds: 0
    },
    population: 1,
    health: 100,
    islandTiles: 100,
    buildings: { hut: 0, farm: 0, storage: 0 },
    inventory: { characterBox: 0, mysteryBox: 0 },
    characters: [],
    protection: {
      stage: 1,
      label: "绝对安全",
      value: 100
    },
    log: [
      "你在一座只有 10×10 的小浮岛上醒来。",
      "四周被雾海笼罩。",
      "你只有一根鱼竿。",
      "目标：活下去。"
    ]
  };
}

let state = newGame();

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function addLog(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 20);
}

function applySurvivalTick(multiplier = 1) {
  const people = state.population;
  const foodNeed = 0.45 * people * multiplier;
  const waterNeed = 0.6 * people * multiplier;

  state.resources.food -= foodNeed;
  state.resources.water -= waterNeed;

  if (state.buildings.farm > 0) {
    state.resources.food += state.buildings.farm * 0.25 * multiplier;
  }

  const shortage = Math.max(0, -state.resources.food) + Math.max(0, -state.resources.water);
  if (shortage > 0) {
    state.health = clamp(state.health - shortage * 8, 0, 100);
    addLog("生存警告：食物或淡水不足，健康正在下降。");
  } else {
    state.health = clamp(state.health + 0.5 * multiplier, 0, 100);
  }

  state.resources.food = Math.max(0, state.resources.food);
  state.resources.water = Math.max(0, state.resources.water);
  state.day = Math.round((state.day + 0.18 * multiplier) * 100) / 100;
}

function updateProtection() {
  const mastery = state.actionCount + state.buildings.hut * 2 + state.buildings.farm * 2 + state.characters.length * 3;
  if (mastery < 10) {
    state.protection = { stage: 1, label: "绝对安全", value: 100 };
  } else if (mastery < 22) {
    state.protection = { stage: 2, label: "低风险", value: 75 };
  } else if (mastery < 38) {
    state.protection = { stage: 3, label: "弱怪出现", value: 50 };
  } else if (mastery < 55) {
    state.protection = { stage: 4, label: "远方威胁", value: 25 };
  } else {
    state.protection = { stage: 5, label: "动态世界", value: 0 };
  }
}

function fish() {
  state.actionCount++;
  applySurvivalTick(0.65);

  const tutorialDrops = [
    ["water", 4, "你钓起了一个密封水囊。淡水 +4。"],
    ["food", 4, "你钓起了一筐还能食用的鱼。食物 +4。"],
    ["wood", 4, "你钓起了漂流木。木材 +4。"],
    ["soil", 3, "你钓起了一袋压实土方。土方 +3。"],
    ["seeds", 2, "你钓起了一只种子匣。种子 +2。"]
  ];

  if (state.actionCount <= tutorialDrops.length) {
    const [key, amount, text] = tutorialDrops[state.actionCount - 1];
    state.resources[key] += amount;
    addLog(text);
    updateProtection();
    return;
  }

  const roll = Math.random();
  if (roll < 0.22) {
    state.resources.food += 3;
    addLog("钓获：可食用鱼群，食物 +3。");
  } else if (roll < 0.42) {
    state.resources.water += 3;
    addLog("钓获：密封淡水桶，淡水 +3。");
  } else if (roll < 0.58) {
    state.resources.wood += 3;
    addLog("钓获：漂流木，木材 +3。");
  } else if (roll < 0.71) {
    state.resources.soil += 2;
    addLog("钓获：土方包，土方 +2。");
  } else if (roll < 0.81) {
    state.resources.seeds += 1;
    addLog("钓获：未知作物种子，种子 +1。");
  } else if (roll < 0.9) {
    state.inventory.characterBox += 1;
    addLog("你钓到一个有人类生命信号的箱子。人物箱 +1。");
  } else {
    state.inventory.mysteryBox += 1;
    addLog("你钓到一个不断震动的未知箱。最好先确认附近是否有人守卫。");
  }
  updateProtection();
}

function expandIsland() {
  if (state.resources.soil < 2) throw new Error("土方不足，需要 2。");
  state.resources.soil -= 2;
  state.islandTiles += 5;
  state.actionCount++;
  applySurvivalTick(0.35);
  addLog("你把土方铺在浮岛边缘，浮岛面积 +5 格。");
  updateProtection();
}

function build(type) {
  const costs = {
    hut: { wood: 5 },
    farm: { wood: 3, seeds: 1 },
    storage: { wood: 4 }
  };
  const names = { hut: "简易住所", farm: "小型农田", storage: "储存棚" };
  const cost = costs[type];
  if (!cost) throw new Error("未知建筑。");

  for (const [key, amount] of Object.entries(cost)) {
    if (state.resources[key] < amount) throw new Error(`${key} 不足。`);
  }
  for (const [key, amount] of Object.entries(cost)) {
    state.resources[key] -= amount;
  }

  state.buildings[type]++;
  state.actionCount++;
  applySurvivalTick(0.55);
  addLog(`建造完成：${names[type]}。`);
  updateProtection();
}

function openCharacterBox() {
  if (state.inventory.characterBox < 1) throw new Error("没有人物箱。");
  state.inventory.characterBox--;
  state.actionCount++;
  applySurvivalTick(0.25);

  const template = characterPool[Math.floor(Math.random() * characterPool.length)];
  const instance = {
    instanceId: `char-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    ...template,
    health: 100,
    status: "空闲"
  };
  state.characters.push(instance);
  state.population++;
  addLog(`人物加入：${instance.name}（${instance.role}）。注意：人口增加也意味着更多粮水消耗。`);
  updateProtection();
}

function openMysteryBox() {
  if (state.inventory.mysteryBox < 1) throw new Error("没有未知箱。");
  state.inventory.mysteryBox--;
  state.actionCount++;
  applySurvivalTick(0.35);

  if (state.protection.stage <= 2) {
    state.resources.wood += 4;
    addLog("新手保护生效：未知箱中只有旧时代零件。木材 +4。");
  } else {
    const monsterRoll = Math.random();
    if (monsterRoll < 0.6) {
      const damage = state.characters.length > 0 ? 8 : 18;
      state.health = clamp(state.health - damage, 0, 100);
      addLog(`危险！箱中钻出雾海幼兽。你们击退了它，但文明健康 -${damage}。`);
    } else {
      state.resources.food += 5;
      addLog("箱中没有怪物，而是一批保存完好的军粮。食物 +5。");
    }
  }
  updateProtection();
}

function getPublicState() {
  return {
    ...state,
    resources: Object.fromEntries(Object.entries(state.resources).map(([k, v]) => [k, Math.round(v * 10) / 10]))
  };
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res) {
  let reqPath = req.url === "/" ? "/index.html" : req.url;
  reqPath = reqPath.split("?")[0];
  const filePath = path.normalize(path.join(clientDir, reqPath));
  if (!filePath.startsWith(clientDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8"
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/state") {
    return json(res, 200, getPublicState());
  }

  if (req.method === "POST" && req.url.startsWith("/api/")) {
    try {
      if (req.url === "/api/fish") fish();
      else if (req.url === "/api/expand") expandIsland();
      else if (req.url === "/api/open-character") openCharacterBox();
      else if (req.url === "/api/open-mystery") openMysteryBox();
      else if (req.url === "/api/reset") state = newGame();
      else if (req.url.startsWith("/api/build/")) build(req.url.split("/").pop());
      else return json(res, 404, { error: "未知操作。" });

      return json(res, 200, getPublicState());
    } catch (err) {
      return json(res, 400, { error: err.message, state: getPublicState() });
    }
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`浮岛时代 V0.1 已启动：http://localhost:${PORT}`);
});
