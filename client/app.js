const $ = s => document.querySelector(s);
const JOBS = [
  ["idle","空闲"],["fisher","渔夫"],["guard","守卫"],["builder","建设者"],["explorer","探索者"]
];

function toast(msg){
  const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),2200);
}

async function post(path){
  const r=await fetch(path,{method:"POST"});
  const d=await r.json();
  if(!r.ok) throw new Error(d.error||"操作失败");
  return d;
}
async function state(){ return fetch("/api/state",{cache:"no-store"}).then(r=>r.json()); }

function worldMap(s){
  const chars=new Map(s.characters.filter(c=>c.alive).map(c=>[c.x+","+c.y,c]));
  const mons=new Map(s.monsters.filter(m=>m.alive).map(m=>[m.x+","+m.y,m]));
  $("#world").style.gridTemplateColumns="repeat("+s.world.size+",1fr)";
  $("#world").innerHTML=s.world.tiles.map(t=>{
    const key=t.x+","+t.y;
    const c=chars.get(key), m=mons.get(key);
    let icon="";
    if(c) icon="👤";
    else if(m) icon="👾";
    else if(!t.revealed) icon="🌫";
    else if(t.type==="land") icon=t.feature==="camp"?"⛺":"";
    const cls=!t.revealed?"fog-tile":t.type==="land"?"land-tile":"void-tile";
    return `<div class="tile ${cls}" title="(${t.x},${t.y})">${icon}</div>`;
  }).join("");
}

function render(s){
  const stats=[
    ["🗓️ 天数",s.day],["❤️ 文明健康",Math.round(s.health)],["👥 人口",s.population],
    ["🏝️ 土地",s.islandTiles],["👤 人物箱",s.inventory.characterBox],["❓ 未知箱",s.inventory.mysteryBox]
  ];
  $("#stats").innerHTML=stats.map(([k,v])=>`<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join("");

  $("#civilization").innerHTML=[
    ["🍖 食物",s.resources.food],["💧 淡水",s.resources.water],["🪵 木材",s.resources.wood],
    ["🟫 土方",s.resources.soil],["🌱 种子",s.resources.seeds],["🏠 住所",s.buildings.hut],
    ["🌾 农田",s.buildings.farm],["📦 储存棚",s.buildings.storage]
  ].map(([k,v])=>`<div class="row"><span>${k}</span><strong>${v}</strong></div>`).join("");

  $("#characters").innerHTML=s.characters.length ? s.characters.map(c=>`
    <div class="character ${c.alive?"":"dead"}">
      <div><strong>${c.name} · ${c.rarity}</strong><small>${c.era}｜${c.role}｜生命 ${Math.round(c.health)}</small></div>
      <p>${c.skill}｜弱点：${c.weakness}</p>
      ${c.alive ? `<select data-character="${c.instanceId}">
        ${JOBS.map(([v,l])=>`<option value="${v}" ${c.job===v?"selected":""}>${l}</option>`).join("")}
      </select>` : "<b>已死亡</b>"}
    </div>
  `).join("") : '<div class="character"><small>现在只有你。继续钓鱼，也许会遇见来自其他时代的人。</small></div>';

  $("#monsters").innerHTML=s.monsters.filter(m=>m.alive).length ? s.monsters.filter(m=>m.alive).map(m=>`
    <div class="monster"><strong>👾 ${m.name}</strong><span>生命 ${Math.max(0,Math.round(m.hp))}/${m.maxHp} · 攻击 ${m.attack}</span></div>
  `).join("") : '<p class="hint">目前岛上没有已知怪物。</p>';

  $("#log").innerHTML=s.log.map(x=>`<div class="log-item">${x}</div>`).join("");
  $("#protectionLabel").textContent=s.protection.label;
  $("#protectionBar").style.width=s.protection.value+"%";
  worldMap(s);
}

document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-action]");
  if(!b) return;
  b.disabled=true;
  try{ render(await post("/api/"+b.dataset.action)); }catch(err){ toast(err.message); }
  finally{ b.disabled=false; }
});

document.addEventListener("change",async e=>{
  if(!e.target.matches("select[data-character]")) return;
  const id=e.target.dataset.character, job=e.target.value;
  try{ render(await post("/api/assign/"+id+"/"+job)); }catch(err){ toast(err.message); }
});

$("#resetBtn").addEventListener("click",async()=>{
  if(confirm("确定重新开始这个文明吗？")) render(await post("/api/reset"));
});

state().then(render);
