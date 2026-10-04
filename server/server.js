const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const rootDir = path.join(__dirname, "..");
const clientDir = path.join(rootDir, "client");
const characterPool = JSON.parse(fs.readFileSync(path.join(rootDir, "shared", "characters.json"), "utf8"));

const JOBS = ["idle", "fisher", "guard", "builder", "explorer"];
const JOB_LABELS = { idle:"空闲", fisher:"渔夫", guard:"守卫", builder:"建设者", explorer:"探索者" };

function makeWorld() {
  const size = 15;
  const tiles = [];
  for (let y=0;y<size;y++) {
    for (let x=0;x<size;x++) {
      const land = x>=3 && x<=11 && y>=3 && y<=11;
      const core = x>=5 && x<=9 && y>=5 && y<=9;
      tiles.push({
        x,y,
        type: land ? "land" : "void",
        revealed: core,
        owned: land,
        feature: core && x===7 && y===7 ? "camp" : null
      });
    }
  }
  return { size, tiles, revealedRadius:2 };
}

function newGame() {
  return {
    version:"0.2.0",
    day:1,
    actionCount:0,
    resources:{food:8,water:8,wood:2,soil:0,seeds:0},
    population:1,
    health:100,
    islandTiles:81,
    buildings:{hut:0,farm:0,storage:0},
    inventory:{characterBox:0,mysteryBox:0},
    characters:[],
    monsters:[],
    world:makeWorld(),
    protection:{stage:1,label:"绝对安全",value:100},
    log:[
      "你在一座被雾海包围的小浮岛上醒来。",
      "脚下土地有限，食物和淡水都不会永远充足。",
      "你只有一根鱼竿。",
      "目标：活下去。"
    ]
  };
}

let state = newGame();

function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function addLog(text){ state.log.unshift(text); state.log=state.log.slice(0,28); }

function jobCount(job){ return state.characters.filter(c=>c.job===job && c.alive).length; }
function jobBonus(job){
  return state.characters.filter(c=>c.job===job && c.alive)
    .reduce((sum,c)=>sum+(c.jobBonus?.[job]||0),0);
}

function revealAround(cx,cy,radius=1){
  for(const t of state.world.tiles){
    if(Math.abs(t.x-cx)<=radius && Math.abs(t.y-cy)<=radius) t.revealed=true;
  }
}

function applySurvivalTick(multiplier=1){
  const living = 1 + state.characters.filter(c=>c.alive).length;
  const foodNeed = 0.45 * living * multiplier;
  const waterNeed = 0.60 * living * multiplier;

  state.resources.food -= foodNeed;
  state.resources.water -= waterNeed;

  const farmOutput = state.buildings.farm * 0.28 * multiplier;
  state.resources.food += farmOutput;

  const fisherOutput = jobCount("fisher") * (0.18 + jobBonus("fisher")*0.1) * multiplier;
  state.resources.food += fisherOutput;

  const shortage = Math.max(0,-state.resources.food)+Math.max(0,-state.resources.water);
  if(shortage>0){
    state.health = clamp(state.health-shortage*7,0,100);
    const victims = state.characters.filter(c=>c.alive);
    if(victims.length && state.health<30 && Math.random()<0.18){
      const victim = victims[Math.floor(Math.random()*victims.length)];
      victim.health = clamp(victim.health-25,0,100);
      if(victim.health===0){
        victim.alive=false;
        victim.job="idle";
        addLog("悲报："+victim.name+" 因长期饥渴和虚弱死亡。");
      }
    }
    addLog("生存警告：食物或淡水不足，文明健康正在下降。");
  }else{
    state.health = clamp(state.health+0.5*multiplier,0,100);
  }

  state.resources.food=Math.max(0,state.resources.food);
  state.resources.water=Math.max(0,state.resources.water);
  state.day=Math.round((state.day+0.18*multiplier)*100)/100;

  monsterTick(multiplier);
}

function monsterTick(multiplier=1){
  for(const m of state.monsters.filter(m=>m.alive)){
    const guards = jobCount("guard");
    const guardPower = guards*10 + jobBonus("guard")*20;
    if(guardPower>0){
      m.hp -= Math.max(2,guardPower*0.16*multiplier);
      if(m.hp<=0){
        m.alive=false;
        addLog("守卫击杀了 "+m.name+"，危险解除。");
        state.resources.food += 2;
        continue;
      }
    }
    if(Math.random()<0.22*multiplier){
      const targets=state.characters.filter(c=>c.alive);
      if(targets.length){
        const victim=targets[Math.floor(Math.random()*targets.length)];
        const reduction=Math.min(0.65, guards*0.12 + jobBonus("guard")*0.25);
        const damage=Math.round(m.attack*(1-reduction));
        victim.health=clamp(victim.health-damage,0,100);
        addLog(m.name+" 袭击了 "+victim.name+"，造成 "+damage+" 点伤害。");
        if(victim.health===0){
          victim.alive=false;
          victim.job="idle";
          addLog(victim.name+" 被怪物杀死。");
        }
      }else{
        state.health=clamp(state.health-m.attack*0.5,0,100);
      }
    }
  }
}

function updateProtection(){
  const mastery=state.actionCount + state.buildings.hut*2 + state.buildings.farm*2 + state.characters.filter(c=>c.alive).length*3;
  if(mastery<10) state.protection={stage:1,label:"绝对安全",value:100};
  else if(mastery<22) state.protection={stage:2,label:"低风险",value:75};
  else if(mastery<38) state.protection={stage:3,label:"弱怪出现",value:50};
  else if(mastery<55) state.protection={stage:4,label:"远方威胁",value:25};
  else state.protection={stage:5,label:"动态世界",value:0};
}

function fish(){
  state.actionCount++;
  applySurvivalTick(0.65);

  const tutorial=[
    ["water",4,"你钓起了一个密封水囊。淡水 +4。"],
    ["food",4,"你钓起了一筐还能食用的鱼。食物 +4。"],
    ["wood",4,"你钓起了漂流木。木材 +4。"],
    ["soil",3,"你钓起了一袋压实土方。土方 +3。"],
    ["seeds",2,"你钓起了一只种子匣。种子 +2。"]
  ];
  if(state.actionCount<=tutorial.length){
    const [k,a,t]=tutorial[state.actionCount-1];
    state.resources[k]+=a; addLog(t); updateProtection(); return;
  }

  let roll=Math.random();
  const fisherLuck=Math.min(0.08,jobCount("fisher")*0.015);
  roll=Math.max(0,roll-fisherLuck);

  if(roll<0.20){state.resources.food+=3;addLog("钓获：可食用鱼群，食物 +3。");}
  else if(roll<0.38){state.resources.water+=3;addLog("钓获：密封淡水桶，淡水 +3。");}
  else if(roll<0.54){state.resources.wood+=3;addLog("钓获：漂流木，木材 +3。");}
  else if(roll<0.67){state.resources.soil+=2;addLog("钓获：土方包，土方 +2。");}
  else if(roll<0.77){state.resources.seeds+=1;addLog("钓获：未知作物种子，种子 +1。");}
  else if(roll<0.89){state.inventory.characterBox++;addLog("你钓到一个有人类生命信号的箱子。人物箱 +1。");}
  else {state.inventory.mysteryBox++;addLog("你钓到一个不断震动的未知箱。最好先安排守卫。");}
  updateProtection();
}

function expandIsland(){
  if(state.resources.soil<2) throw new Error("土方不足，需要 2。");
  state.resources.soil-=2;
  const hidden = state.world.tiles.filter(t=>t.type==="void" && t.revealed);
  const target = hidden[0];
  if(target){ target.type="land"; target.owned=true; target.feature=null; state.islandTiles++; }
  else state.islandTiles+=5;
  state.actionCount++; applySurvivalTick(0.35);
  addLog("你把土方铺在浮岛边缘，新的土地稳定下来。");
  updateProtection();
}

function build(type){
  const costs={hut:{wood:5},farm:{wood:3,seeds:1},storage:{wood:4}};
  const names={hut:"简易住所",farm:"小型农田",storage:"储存棚"};
  const cost=costs[type];
  if(!cost) throw new Error("未知建筑。");
  const builderDiscount=Math.min(0.3,jobBonus("builder")*0.35);
  for(const [k,a0] of Object.entries(cost)){
    const a=Math.max(1,Math.ceil(a0*(1-builderDiscount)));
    if(state.resources[k]<a) throw new Error(k+" 不足，需要 "+a+"。");
  }
  for(const [k,a0] of Object.entries(cost)){
    const a=Math.max(1,Math.ceil(a0*(1-builderDiscount)));
    state.resources[k]-=a;
  }
  state.buildings[type]++; state.actionCount++; applySurvivalTick(0.55);
  addLog("建造完成："+names[type]+"。");
  updateProtection();
}

function openCharacterBox(){
  if(state.inventory.characterBox<1) throw new Error("没有人物箱。");
  state.inventory.characterBox--; state.actionCount++; applySurvivalTick(0.25);
  const template=characterPool[Math.floor(Math.random()*characterPool.length)];
  const instance={
    instanceId:"char-"+Date.now()+"-"+Math.floor(Math.random()*100000),
    ...template,
    health:100,
    alive:true,
    job:"idle",
    x:7+Math.floor(Math.random()*3)-1,
    y:7+Math.floor(Math.random()*3)-1
  };
  state.characters.push(instance);
  state.population=1+state.characters.filter(c=>c.alive).length;
  addLog("人物加入："+instance.name+"（"+instance.role+"）。人口增加也意味着更多粮水消耗。");
  updateProtection();
}

function openMysteryBox(){
  if(state.inventory.mysteryBox<1) throw new Error("没有未知箱。");
  state.inventory.mysteryBox--; state.actionCount++; applySurvivalTick(0.35);

  if(state.protection.stage<=2){
    state.resources.wood+=4;
    addLog("新手保护生效：未知箱中只有旧时代零件。木材 +4。");
  }else if(Math.random()<0.68){
    const monster={
      id:"monster-"+Date.now()+"-"+Math.floor(Math.random()*10000),
      name:Math.random()<0.5?"雾海幼兽":"裂壳爬行者",
      hp:36+state.protection.stage*6,
      maxHp:36+state.protection.stage*6,
      attack:8+state.protection.stage*2,
      alive:true,
      x:8,y:7
    };
    state.monsters.push(monster);
    addLog("危险！"+monster.name+" 从箱中冲了出来。它现在真实存在于岛上。");
  }else{
    state.resources.food+=5;
    addLog("箱中没有怪物，而是一批保存完好的军粮。食物 +5。");
  }
  updateProtection();
}

function assignJob(id,job){
  if(!JOBS.includes(job)) throw new Error("未知工作。");
  const c=state.characters.find(c=>c.instanceId===id && c.alive);
  if(!c) throw new Error("人物不存在或已经死亡。");
  c.job=job;
  state.actionCount++;
  addLog(c.name+" 被安排为"+JOB_LABELS[job]+"。");
  if(job==="explorer"){
    revealAround(c.x,c.y,2);
    const fog=state.world.tiles.filter(t=>!t.revealed);
    if(fog.length){
      const t=fog[Math.floor(Math.random()*fog.length)];
      revealAround(t.x,t.y,1);
      c.x=t.x;c.y=t.y;
      addLog(c.name+" 深入雾区，新的坐标区域被发现。");
    }
  }
  updateProtection();
}

function getPublicState(){
  state.population=1+state.characters.filter(c=>c.alive).length;
  return {
    ...state,
    resources:Object.fromEntries(Object.entries(state.resources).map(([k,v])=>[k,Math.round(v*10)/10]))
  };
}

function json(res,code,data){
  res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
  res.end(JSON.stringify(data));
}

function serveStatic(req,res){
  let reqPath=req.url==="/" ? "/index.html" : req.url.split("?")[0];
  const filePath=path.normalize(path.join(clientDir,reqPath));
  if(!filePath.startsWith(clientDir)){res.writeHead(403);return res.end("Forbidden");}
  fs.readFile(filePath,(err,data)=>{
    if(err){res.writeHead(404);return res.end("Not found");}
    const ext=path.extname(filePath);
    const ct={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8"}[ext]||"application/octet-stream";
    res.writeHead(200,{"Content-Type":ct});res.end(data);
  });
}

const server=http.createServer((req,res)=>{
  if(req.method==="GET" && req.url==="/api/state") return json(res,200,getPublicState());

  if(req.method==="POST" && req.url.startsWith("/api/")){
    try{
      if(req.url==="/api/fish") fish();
      else if(req.url==="/api/expand") expandIsland();
      else if(req.url==="/api/open-character") openCharacterBox();
      else if(req.url==="/api/open-mystery") openMysteryBox();
      else if(req.url==="/api/reset") state=newGame();
      else if(req.url.startsWith("/api/build/")) build(req.url.split("/").pop());
      else if(req.url.startsWith("/api/assign/")){
        const parts=req.url.split("/");
        assignJob(parts[3],parts[4]);
      } else return json(res,404,{error:"未知操作。"});
      return json(res,200,getPublicState());
    }catch(err){
      return json(res,400,{error:err.message,state:getPublicState()});
    }
  }
  serveStatic(req,res);
});

server.listen(PORT,()=>console.log("浮岛时代 V0.2 已启动：http://localhost:"+PORT));
