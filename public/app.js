let DB = null;
let DISC_INDEX = null;

// Partner & V-Pet Game State
const gameState = {
  partnerId: 3, // Agumon (ID 3 in SLES_029.14)
  hp: 1200,
  maxHp: 1200,
  mp: 900,
  maxMp: 900,
  offense: 145,
  defense: 120,
  speed: 115,
  brains: 130,
  happiness: 88,
  discipline: 78,
  weight: 20,
  fatigue: 10,
  poopCount: 0,
  bits: 2500,
  prosperity: 15,
  day: 1,
  hour: 10,
  minute: 0,
  area: 'File City (Top)',
  mode: 'field', // 'field' | 'battle' | 'training'
  enemy: null,
  particles: [],
  floatingTexts: [],
  animTick: 0,
  inventory: [
    { itemId: 37, count: 5 }, // Meat
    { itemId: 38, count: 3 }, // Giant Meat
    { itemId: 39, count: 2 }, // Sirloin
    { itemId: 0, count: 4 },  // sm recovery
    { itemId: 4, count: 3 },  // MP Floppy
    { itemId: 22, count: 1 }, // Off. Chip
    { itemId: 24, count: 1 }, // Brain Chip
    { itemId: 69, count: 1 }, // Chain Melon
    { itemId: 70, count: 1 }, // Grey Claws ( -> Greymon)
    { itemId: 91, count: 1 }, // Metal Parts ( -> MetalGreymon)
    { itemId: 94, count: 1 }, // Mega Hand ( -> Megadramon)
    { itemId: 99, count: 1 }  // X Bandage ( -> Monzaemon)
  ]
};

// Preload extracted PS1 TIM PNGs for canvas rendering
const timImages = {
  title: new Image(),
  item: new Image(),
  btl: new Image(),
  fi: new Image()
};
timImages.title.src = '/textures/TITLE256.png';
timImages.item.src = '/textures/ITEM.png';
timImages.btl.src = '/textures/BTLCOMND.png';
timImages.fi.src = '/textures/FI_INFO.png';

// Digivolution item mapping (SLES_029.14 Item ID -> Target Digimon ID)
const EVO_ITEM_MAP = {
  70: 5,  // Grey Claws -> Greymon
  71: 9,  // Flaming Wing -> Birdramon (21) or Meramon (9)
  72: 33, // Iron Hoof -> Centarumon
  73: 43, // Mono Stone -> Monochromon
  74: 35, // Steel Drill -> Drimogemon
  75: 8,  // White Fossil -> Tyrannomon
  76: 6,  // Black Wings -> Devimon
  77: 31, // Spike club -> Ogremon
  78: 44, // Flaming Mane -> Leomon
  79: 20, // White Wings -> Angemon
  80: 34, // Old Cloth -> Bakemon
  81: 29, // Elec Ring -> Kunemon / Kabuterimon
  82: 7,  // Rainbowhorn -> Airdramon
  83: 46, // Rooster -> Kokatorimon
  84: 30, // Unihorn -> Unimon
  85: 19, // Horn Helmet -> Kabuterimon
  86: 47, // Scissor Jaws -> Kuwagamon
  87: 25, // Fertilizer -> Vegiemon
  88: 53, // Koga's Laws -> Ninjamon
  89: 10, // Water Bottle -> Seadramon
  90: 24, // North star -> Whamon
  91: 12, // Metal Parts -> MetalGreymon
  92: 26, // Fatal Bone -> SkullGreymon
  93: 37, // Cyber Parts -> Andromon
  94: 50, // Mega Hand -> Megadramon
  95: 13, // Silver Ball -> Mamemon
  96: 27, // Metal Armor -> MetalMamemon
  97: 38, // Chainsaw -> Giromon
  98: 51, // Small Spear -> Piximon
  99: 14, // X Bandage -> Monzaemon
  100: 28,// Ray Gun -> Vademon
  101: 39,// Gold Banana -> Etemon
  102: 52,// Mysty Egg -> Digitamamon
  103: 54,// Red Ruby -> Phoenixmon
  104: 55,// Beetlepearl -> HerculesKabuterimon
  105: 56,// Coral charm -> MegaSeadramon
  106: 57 // Moon Mirror -> WereGarurumon
};

function addLog(msg, color = '#e2e8f0') {
  const box = document.getElementById('vpetLog');
  if (!box) return;
  const timeStr = `D${gameState.day} ${String(gameState.hour).padStart(2, '0')}:${String(gameState.minute).padStart(2, '0')}`;
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="time">[${timeStr}]</span><span style="color:${color};">${msg}</span>`;
  box.prepend(div);
}

function getPartner() {
  if (!DB) return null;
  return DB.digimon.find(d => d.id === gameState.partnerId) || DB.digimon[3];
}

function getItemSpriteStyle(itemId) {
  const col = itemId % 16;
  const row = Math.floor(itemId / 16);
  const x = -(col * 32);
  const y = -(row * 32);
  return `background-position: ${x}px ${y}px;`;
}

function updateVpetUI() {
  const p = getPartner();
  if (!p) return;

  document.getElementById('hudDigimonName').textContent = p.name;
  document.getElementById('hudStage').textContent = p.level;
  document.getElementById('hudType').textContent = p.type;
  document.getElementById('hudBits').textContent = gameState.bits.toLocaleString();
  document.getElementById('hudProsperity').textContent = gameState.prosperity;

  const timePeriod = gameState.hour >= 6 && gameState.hour < 17 ? 'Day' : (gameState.hour >= 17 && gameState.hour < 20 ? 'Sunset' : 'Night');
  document.getElementById('hudClock').textContent = `Day ${gameState.day} • ${String(gameState.hour).padStart(2, '0')}:${String(gameState.minute).padStart(2, '0')} (${timePeriod})`;

  document.getElementById('partnerStructAddr').textContent = `SLES_029.14 @ ${p.structOffset}`;
  document.getElementById('partnerModelCode').textContent = p.modelFile;
  document.getElementById('partnerSpecs').textContent = p.specialties.join(', ') || 'None';
  document.getElementById('partnerFinisher').textContent = p.finisher || 'None';
  document.getElementById('partnerDrop').textContent = p.dropChance > 0 ? `${p.dropItem} (${p.dropChance}%)` : 'None';

  document.getElementById('statHpVal').textContent = `${gameState.hp} / ${gameState.maxHp}`;
  document.getElementById('statHpBar').style.width = `${Math.min(100, (gameState.hp / gameState.maxHp) * 100)}%`;

  document.getElementById('statMpVal').textContent = `${gameState.mp} / ${gameState.maxMp}`;
  document.getElementById('statMpBar').style.width = `${Math.min(100, (gameState.mp / gameState.maxMp) * 100)}%`;

  document.getElementById('statOffVal').textContent = `${gameState.offense} / 999`;
  document.getElementById('statOffBar').style.width = `${Math.min(100, (gameState.offense / 999) * 100)}%`;

  document.getElementById('statDefVal').textContent = `${gameState.defense} / 999`;
  document.getElementById('statDefBar').style.width = `${Math.min(100, (gameState.defense / 999) * 100)}%`;

  document.getElementById('statSpdVal').textContent = `${gameState.speed} / 999`;
  document.getElementById('statSpdBar').style.width = `${Math.min(100, (gameState.speed / 999) * 100)}%`;

  document.getElementById('statBrnVal').textContent = `${gameState.brains} / 999`;
  document.getElementById('statBrnBar').style.width = `${Math.min(100, (gameState.brains / 999) * 100)}%`;

  document.getElementById('statHapVal').textContent = `${gameState.happiness}% / ${gameState.discipline}%`;
  document.getElementById('statHapBar').style.width = `${gameState.happiness}%`;

  document.getElementById('statWgtVal').textContent = `${gameState.weight}G • ${gameState.fatigue}% Fatigue`;
  document.getElementById('statFatigueBar').style.width = `${gameState.fatigue}%`;

  // Render moveset badges
  const movesWrap = document.getElementById('partnerMovesList');
  movesWrap.innerHTML = '';
  p.moves.forEach(moveName => {
    const tech = DB.techniques.find(t => t.name === moveName);
    const isFin = moveName === p.finisher;
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.style.padding = '5px 10px';
    btn.style.fontSize = '0.75rem';
    if (isFin) {
      btn.style.borderColor = '#f59e0b';
      btn.style.color = '#fbbf24';
    }
    btn.innerHTML = `${isFin ? '★ ' : ''}${moveName} <span class="mono" style="opacity:0.75;">(${tech ? tech.power + 'P / ' + tech.mpCost + 'MP' : ''})</span>`;
    btn.onclick = () => usePartnerTechnique(tech || { name: moveName, power: 100, mpCost: 30, specialty: 'Fire' });
    movesWrap.appendChild(btn);
  });

  renderInventory();
}

function renderInventory() {
  const grid = document.getElementById('inventoryGrid');
  if (!grid || !DB) return;
  grid.innerHTML = '';

  gameState.inventory.filter(slot => slot.count > 0).forEach(slot => {
    const item = DB.items[slot.itemId];
    if (!item) return;
    const card = document.createElement('div');
    card.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; background:var(--bg-card); border:1px solid var(--border); padding:6px 10px; border-radius:8px;';
    card.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; min-width:0;">
        <span class="item-icon-sprite" style="${getItemSpriteStyle(item.id)}" title="${item.description}"></span>
        <div style="min-width:0;">
          <div style="font-size:0.8rem; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
          <div style="font-size:0.7rem; color:var(--text-muted);">x${slot.count} • ${item.category}</div>
        </div>
      </div>
      <button class="nav-btn" style="padding:4px 8px; font-size:0.74rem;">Use</button>
    `;
    card.querySelector('button').onclick = () => useInventoryItem(slot.itemId);
    grid.appendChild(card);
  });
}

function spawnFloatingText(x, y, text, color = '#fbbf24') {
  gameState.floatingTexts.push({ x, y, text, color, life: 55 });
}

function useInventoryItem(itemId) {
  const slot = gameState.inventory.find(s => s.itemId === itemId && s.count > 0);
  if (!slot) return;
  const item = DB.items[itemId];
  slot.count--;

  const p = getPartner();
  if (EVO_ITEM_MAP[itemId]) {
    const targetId = EVO_ITEM_MAP[itemId];
    const targetDigimon = DB.digimon.find(d => d.id === targetId);
    if (targetDigimon) {
      gameState.partnerId = targetId;
      gameState.maxHp += 800;
      gameState.hp = gameState.maxHp;
      gameState.maxMp += 600;
      gameState.mp = gameState.maxMp;
      gameState.offense = Math.min(999, gameState.offense + 120);
      gameState.defense = Math.min(999, gameState.defense + 110);
      gameState.speed = Math.min(999, gameState.speed + 95);
      gameState.brains = Math.min(999, gameState.brains + 100);
      gameState.weight += 15;
      document.getElementById('partnerSpeciesSelect').value = String(targetId);
      spawnFloatingText(170, 90, `DIGIVOLVED TO ${targetDigimon.name.toUpperCase()}!`, '#fbbf24');
      addLog(`✨ Used ${item.name} (Handler ${item.handlerPtr})! ${p.name} digivolved into <strong>${targetDigimon.name}</strong>!`, '#fbbf24');
      updateVpetUI();
      return;
    }
  }

  if (item.category === 'Recovery / Medicine') {
    if (item.name.toLowerCase().includes('mp')) {
      gameState.mp = Math.min(gameState.maxMp, gameState.mp + 1500);
      spawnFloatingText(160, 110, '+1500 MP', '#22d3ee');
    } else {
      const heal = itemId === 0 ? 500 : (itemId === 1 ? 1500 : 5000);
      gameState.hp = Math.min(gameState.maxHp, gameState.hp + heal);
      spawnFloatingText(160, 110, `+${heal} HP`, '#34d399');
    }
    addLog(`💊 Used <strong>${item.name}</strong> (${item.description}).`, '#34d399');
  } else if (item.category === 'Stat Chip') {
    gameState.offense = Math.min(999, gameState.offense + 50);
    gameState.defense = Math.min(999, gameState.defense + 50);
    gameState.speed = Math.min(999, gameState.speed + 50);
    gameState.brains = Math.min(999, gameState.brains + 50);
    spawnFloatingText(160, 100, 'STATS +50!', '#c084fc');
    addLog(`⚡ Installed <strong>${item.name}</strong>! Parameters permanently boosted!`, '#c084fc');
  } else {
    // Food
    gameState.weight += 2;
    gameState.happiness = Math.min(100, gameState.happiness + 8);
    gameState.hp = Math.min(gameState.maxHp, gameState.hp + 200);
    if (itemId === 69) {
      // Chain Melon
      gameState.fatigue = 0;
      gameState.happiness = 100;
    }
    spawnFloatingText(160, 110, `YUM! +Weight`, '#fbbf24');
    addLog(`🍖 Fed <strong>${item.name}</strong> to ${p.name} (${item.description}).`, '#fbbf24');
  }
  updateVpetUI();
}

function startWildBattle() {
  const area = gameState.area;
  let poolIds = [4, 17, 18, 29, 31, 41, 43];
  if (area.includes('Freezeland')) poolIds = [23, 52, 65, 66, 22];
  else if (area.includes('Tropical')) poolIds = [25, 42, 46, 47, 51];
  else if (area.includes('Ogre')) poolIds = [31, 6, 44, 72];
  else if (area.includes('Mt. Infinity')) poolIds = [12, 50, 60, 116, 37];
  else if (area.includes('Arena')) poolIds = [5, 12, 26, 13, 50, 54];

  const enemyId = poolIds[Math.floor(Math.random() * poolIds.length)];
  const eData = DB.digimon.find(d => d.id === enemyId) || DB.digimon[5];
  const eHp = (eData.levelCode || 3) * 650;

  gameState.mode = 'battle';
  gameState.enemy = {
    data: eData,
    hp: eHp,
    maxHp: eHp
  };

  addLog(`⚔️ Wild <strong>${eData.name}</strong> (${eData.level}, ${eData.type}, Struct ${eData.structOffset}) appeared in ${area}!`, '#f87171');
  updateVpetUI();
}

function usePartnerTechnique(tech) {
  const p = getPartner();
  if (gameState.mode !== 'battle' || !gameState.enemy) {
    startWildBattle();
  }
  const enemy = gameState.enemy;
  if (!enemy) return;

  const mpCost = tech.mpCost || 30;
  if (gameState.mp < mpCost) {
    addLog(`⚠️ Not enough MP for ${tech.name} (Needs ${mpCost} MP)! Use an MP Floppy!`, '#f87171');
    return;
  }
  gameState.mp = Math.max(0, gameState.mp - mpCost);

  const baseDmg = Math.max(45, Math.floor((tech.power || 100) * (1 + gameState.offense / 280) - (enemy.data.levelCode * 18)));
  enemy.hp = Math.max(0, enemy.hp - baseDmg);

  spawnFloatingText(410, 95, `${tech.name}! -${baseDmg}`, '#fbbf24');
  addLog(`🔥 ${p.name} used <strong>${tech.name}</strong> (${tech.power} Power, ${mpCost} MP) → Dealt <strong>${baseDmg} DMG</strong> to ${enemy.data.name}!`, '#38bdf8');

  if (enemy.hp <= 0) {
    const bitReward = (enemy.data.levelCode || 3) * 450;
    gameState.bits += bitReward;
    gameState.offense = Math.min(999, gameState.offense + 12);
    gameState.speed = Math.min(999, gameState.speed + 10);
    gameState.defense = Math.min(999, gameState.defense + 10);
    gameState.prosperity += 1;

    let dropMsg = '';
    if (enemy.data.dropItem && enemy.data.dropItem !== 'None') {
      const droppedItemObj = DB.items.find(i => i.name === enemy.data.dropItem);
      if (droppedItemObj) {
        const existing = gameState.inventory.find(s => s.itemId === droppedItemObj.id);
        if (existing) existing.count++;
        else gameState.inventory.push({ itemId: droppedItemObj.id, count: 1 });
        dropMsg = ` & dropped <strong>${enemy.data.dropItem}</strong> (${enemy.data.dropChance}% ROM rate)!`;
      }
    }

    spawnFloatingText(280, 70, `YOU WIN! +${bitReward} BITS`, '#34d399');
    addLog(`🏆 Defeated <strong>${enemy.data.name}</strong>! Earned <strong>${bitReward} Bits</strong>${dropMsg}`, '#34d399');
    gameState.mode = 'field';
    gameState.enemy = null;
  } else {
    // Enemy counterattack using its own ROM moveset!
    const eMoves = enemy.data.moves;
    const eMoveName = eMoves.length > 0 ? eMoves[Math.floor(Math.random() * eMoves.length)] : 'Sonic Jab';
    const eTech = DB.techniques.find(t => t.name === eMoveName) || { name: eMoveName, power: 90 };
    const counterDmg = Math.max(25, Math.floor((eTech.power || 90) * 1.15 - gameState.defense * 0.45));
    gameState.hp = Math.max(1, gameState.hp - counterDmg);
    spawnFloatingText(150, 105, `${eTech.name} -${counterDmg}`, '#f87171');
    addLog(`💥 ${enemy.data.name} countered with <strong>${eTech.name}</strong> for ${counterDmg} DMG!`, '#f87171');
  }
  updateVpetUI();
}

// Canvas 60fps Renderer for File Island WebUI
function startCanvasLoop() {
  const canvas = document.getElementById('vpetCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function drawDigimonCharacter(x, y, digi, isEnemy = false, tick = 0) {
    const bob = Math.sin(tick * 0.08 + (isEnemy ? 2 : 0)) * 4;
    ctx.save();
    ctx.translate(x, y + bob);
    if (isEnemy) ctx.scale(-1, 1);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 42 - bob, 32, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Color based on specialty & stage
    const spec = digi.specialties[0] || 'Fire';
    const palette = {
      Fire: ['#f59e0b', '#dc2626', '#fef08a'],
      Battle: ['#fb923c', '#991b1b', '#fde047'],
      Air: ['#38bdf8', '#1d4ed8', '#e0f2fe'],
      Earth: ['#4ade80', '#15803d', '#fef08a'],
      Ice: ['#67e8f9', '#0369a1', '#f0f9ff'],
      Mech: ['#94a3b8', '#334155', '#ef4444'],
      Filth: ['#a3e635', '#4d7c0f', '#fde047']
    }[spec] || ['#f59e0b', '#b45309', '#fef08a'];

    const sizeScale = digi.levelCode === 1 ? 0.65 : (digi.levelCode === 2 ? 0.78 : (digi.levelCode === 3 ? 0.95 : (digi.levelCode === 4 ? 1.15 : 1.25)));
    ctx.scale(sizeScale, sizeScale);

    // Body
    ctx.fillStyle = palette[0];
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-24, -22, 48, 48, 14);
    ctx.fill();
    ctx.stroke();

    // Belly / Chest plate
    ctx.fillStyle = palette[2];
    ctx.beginPath();
    ctx.roundRect(-14, -4, 28, 24, 8);
    ctx.fill();

    // Crest / Horns / Wings for Champion & Ultimate
    if (digi.levelCode >= 4) {
      ctx.fillStyle = palette[1];
      ctx.beginPath();
      ctx.moveTo(-18, -22);
      ctx.lineTo(-28, -42);
      ctx.lineTo(-6, -22);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(6, -22);
      ctx.lineTo(18, -44);
      ctx.lineTo(22, -22);
      ctx.fill();
      ctx.stroke();
    } else if (digi.levelCode >= 2) {
      ctx.fillStyle = palette[1];
      ctx.fillRect(-10, -28, 20, 7);
    }

    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(4, -14, 9, 9);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, -13, 4, 4);

    // Claws / Feet
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-18, 24, 12, 8);
    ctx.fillRect(8, 24, 12, 8);

    ctx.restore();

    // Nameplate
    ctx.fillStyle = 'rgba(6, 10, 20, 0.82)';
    ctx.fillRect(x - 62, y - 66, 124, 20);
    ctx.strokeStyle = isEnemy ? '#ef4444' : '#f59e0b';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 62, y - 66, 124, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${digi.name} [${digi.modelCode}]`, x, y - 52);
  }

  function render() {
    gameState.animTick++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Area Sky & Terrain
    const area = gameState.area;
    let skyGrad = ctx.createLinearGradient(0, 0, 0, 180);
    if (area.includes('Freezeland')) {
      skyGrad.addColorStop(0, '#0c4a6e');
      skyGrad.addColorStop(1, '#bae6fd');
    } else if (area.includes('Ogre') || area.includes('Infinity')) {
      skyGrad.addColorStop(0, '#1e1b4b');
      skyGrad.addColorStop(1, '#4c1d95');
    } else {
      skyGrad.addColorStop(0, '#0f172a');
      skyGrad.addColorStop(1, '#1e3a5f');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, 185);

    // Ground Grid (Digital World wireframe aesthetic)
    ctx.fillStyle = area.includes('Freezeland') ? '#334155' : (area.includes('Green Gym') ? '#064e3b' : '#14261c');
    ctx.fillRect(0, 185, canvas.width, 85);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < canvas.width; gx += 35) {
      ctx.beginPath();
      ctx.moveTo(gx, 185);
      ctx.lineTo(gx - 30, 270);
      ctx.stroke();
    }

    // Draw authentic FI_INFO.TIM clock icon in top-right of canvas
    if (timImages.fi.complete && timImages.fi.naturalWidth > 0) {
      ctx.drawImage(timImages.fi, 208, 26, 48, 38, canvas.width - 56, 8, 48, 38);
    }

    // Draw Partner Digimon
    const partner = getPartner();
    if (partner) {
      drawDigimonCharacter(145, 175, partner, false, gameState.animTick);
    }

    // Draw Poop if any
    for (let p = 0; p < gameState.poopCount; p++) {
      if (timImages.btl.complete && timImages.btl.naturalWidth > 0) {
        ctx.drawImage(timImages.btl, 192, 16, 16, 16, 65 + p * 22, 200, 24, 24);
      }
    }

    // Draw Enemy in Battle Mode
    if (gameState.mode === 'battle' && gameState.enemy) {
      const e = gameState.enemy;
      drawDigimonCharacter(415, 175, e.data, true, gameState.animTick);

      // Enemy HP Bar
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(350, 228, 130, 12);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(352, 230, Math.max(0, (e.hp / e.maxHp) * 126), 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`HP ${e.hp}/${e.maxHp}`, 415, 252);
    } else {
      // Peaceful area signpost
      ctx.fillStyle = 'rgba(13, 20, 38, 0.82)';
      ctx.fillRect(330, 145, 200, 62);
      ctx.strokeStyle = '#24355e';
      ctx.strokeRect(330, 145, 200, 62);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`📍 ${gameState.area}`, 340, 163);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px monospace';
      ctx.fillText('Click [Wild Battle] or any', 340, 180);
      ctx.fillText('Technique below to fight!', 340, 195);
    }

    // Floating combat/status texts
    for (let i = gameState.floatingTexts.length - 1; i >= 0; i--) {
      const ft = gameState.floatingTexts[i];
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ft.y -= 0.7;
      ft.life--;
      if (ft.life <= 0) gameState.floatingTexts.splice(i, 1);
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

// Populate REA & Binary Analysis Tab
function renderReaAndExeTab() {
  if (!DB) return;
  const r = DB.rea;
  const d = DB.disc;
  const e = DB.executable;

  document.getElementById('reaSummaryCard').innerHTML = `
    <div><strong>REA Engine:</strong> rea-agents v${r.version} (${r.authority})</div>
    <div><strong>Evidence ID:</strong> <span style="color:#38bdf8;">${r.evidenceId}</span></div>
    <div><strong>Manifest ID:</strong> ${r.manifestId}</div>
    <div><strong>ZIP SHA-256:</strong> <span style="color:#fbbf24;">${r.zipSha256}</span></div>
    <div><strong>BIN SHA-256:</strong> <span style="color:#34d399;">${r.binSha256}</span></div>
    <div><strong>CUE SHA-256:</strong> ${r.cueSha256}</div>
    <div><strong>SLES_029.14 SHA-256:</strong> <span style="color:#c084fc;">${r.slesSha256}</span></div>
    <div><strong>ISO9660 Volume:</strong> ${d.pvd.volumeId} (${d.pvd.publisherId}, ${d.pvd.totalSectors.toLocaleString()} Mode2 sectors)</div>
  `;

  document.getElementById('exeHeaderCard').innerHTML = `
    <div><strong>Executable:</strong> ${e.name} (${e.magic})</div>
    <div><strong>Architecture:</strong> ${e.architecture}</div>
    <div><strong>Entrypoint (PC0):</strong> <span style="color:#fbbf24;">${e.pc0}</span></div>
    <div><strong>Text Load (t_addr):</strong> <span style="color:#38bdf8;">${e.t_addr}</span> (${e.t_size.toLocaleString()} bytes)</div>
    <div><strong>BSS Segment:</strong> ${e.b_addr} (${e.b_size.toLocaleString()} bytes)</div>
    <div><strong>Stack Top (SP):</strong> ${e.s_addr}</div>
    <div><strong>Functions Detected:</strong> <span style="color:#34d399;">${e.detectedFunctions.toLocaleString()}</span> (${e.jalCallSites.toLocaleString()} JAL calls)</div>
    <div><strong>Header License:</strong> ${e.licenseHeader}</div>
  `;

  // Overlays Table
  const ovBody = document.getElementById('overlaysTableBody');
  ovBody.innerHTML = DB.overlays.map(ov => `
    <tr>
      <td class="mono" style="color:#fbbf24; font-weight:700;">${ov.name}</td>
      <td>${ov.role}</td>
      <td class="mono">${ov.size.toLocaleString()} B</td>
      <td class="mono">${ov.lba}</td>
      <td class="mono" style="font-size:0.72rem; color:var(--text-muted);">${ov.sha256.slice(0, 20)}…</td>
    </tr>
  `).join('');

  loadMipsDisassembly('0x800A4B40');
}

async function loadMipsDisassembly(vaddr) {
  const res = await fetch(`/api/mips-disasm?vaddr=${encodeURIComponent(vaddr)}&count=44`);
  const data = await res.json();
  const tbody = document.getElementById('mipsDisasmBody');
  tbody.innerHTML = data.instructions.map(ins => {
    const isBranchOrCall = /^(jal|j|jr|beq|bne)\b/.test(ins.asm);
    const isStackPrologue = ins.asm.startsWith('addiu $sp, $sp, -');
    const color = isStackPrologue ? '#34d399' : (isBranchOrCall ? '#fbbf24' : '#e2e8f0');
    return `
      <tr>
        <td style="color:#38bdf8;">${ins.vaddr}</td>
        <td style="color:var(--text-muted);">${ins.fileOffset}</td>
        <td style="color:#94a3b8;">${ins.bytes}</td>
        <td style="color:${color}; font-weight:${isStackPrologue || isBranchOrCall ? '700' : '400'};">${ins.asm}</td>
      </tr>
    `;
  }).join('');
}

// Populate Extracted ROM Database Tab
function renderRomDatabaseTab() {
  if (!DB) return;

  function updateDigimonTable() {
    const q = (document.getElementById('searchDigimon').value || '').toLowerCase();
    const stg = document.getElementById('filterDigimonStage').value;
    const typ = document.getElementById('filterDigimonType').value;

    const filtered = DB.digimon.filter(d => {
      if (stg && d.level !== stg) return false;
      if (typ && d.type !== typ) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q) ||
             d.modelCode.toLowerCase().includes(q) ||
             d.dropItem.toLowerCase().includes(q) ||
             d.moves.some(m => m.toLowerCase().includes(q));
    });

    document.getElementById('digimonTableBody').innerHTML = filtered.map(d => `
      <tr>
        <td class="mono">#${d.id}</td>
        <td>
          <strong style="color:#f8fafc;">${d.name}</strong>
          <div class="mono" style="font-size:0.7rem; color:var(--text-muted);">${d.structOffset}</div>
        </td>
        <td class="mono"><span class="badge badge-cyan">${d.modelFile}</span></td>
        <td>${d.level}</td>
        <td><span class="badge ${d.type === 'Vaccine' ? 'badge-green' : (d.type === 'Virus' ? 'badge-red' : 'badge-purple')}">${d.type}</span></td>
        <td>${d.specialties.join(', ') || '—'}</td>
        <td style="max-width:290px;">
          ${d.finisher ? `<span class="badge badge-gold">★ ${d.finisher}</span> ` : ''}
          <span style="font-size:0.75rem; color:var(--text-muted);">${d.moves.slice(0, 6).join(', ')}${d.moves.length > 6 ? ` (+${d.moves.length - 6} more)` : ''}</span>
        </td>
        <td>${d.dropChance > 0 ? `${d.dropItem} <span class="mono">(${d.dropChance}%)</span>` : '—'}</td>
        <td>
          <button class="nav-btn select-partner-btn" data-id="${d.id}" style="padding:4px 8px; font-size:0.74rem;">Play as ${d.name}</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.select-partner-btn').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.dataset.id, 10);
        gameState.partnerId = id;
        document.getElementById('partnerSpeciesSelect').value = String(id);
        updateVpetUI();
        document.querySelector('[data-tab="tab-vpet"]').click();
        addLog(`🧬 Switched active partner to <strong>${getPartner().name}</strong> (Struct ${getPartner().structOffset})!`, '#fbbf24');
      };
    });
  }

  function updateTechTable() {
    const q = (document.getElementById('searchTech').value || '').toLowerCase();
    const el = document.getElementById('filterTechElement').value;
    const filtered = DB.techniques.filter(t => {
      if (el && t.specialty !== el) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.specialty.toLowerCase().includes(q) || t.statusEffect.toLowerCase().includes(q);
    });

    document.getElementById('techTableBody').innerHTML = filtered.map(t => `
      <tr>
        <td class="mono">#${t.id}</td>
        <td><strong style="color:${t.isFinisher ? '#fbbf24' : '#f8fafc'};">${t.isFinisher ? '★ ' : ''}${t.name}</strong></td>
        <td><span class="badge ${t.isFinisher ? 'badge-gold' : 'badge-cyan'}">${t.category}</span></td>
        <td>${t.specialty}</td>
        <td class="mono" style="font-weight:700; color:#f87171;">${t.power}</td>
        <td class="mono" style="color:#38bdf8;">${t.mpCost} MP <span style="color:var(--text-muted);">(${t.mpRaw}×3)</span></td>
        <td>${t.range}</td>
        <td>${t.statusEffect !== 'None' ? `<span class="badge badge-purple">${t.statusEffect} (${t.statusChance}%)</span>` : '—'}</td>
        <td class="mono">${t.accuracyFactor}</td>
        <td class="mono" style="color:var(--text-muted);">${t.structOffset}</td>
      </tr>
    `).join('');
  }

  function updateItemTable() {
    const q = (document.getElementById('searchItem').value || '').toLowerCase();
    const cat = document.getElementById('filterItemCat').value;
    const filtered = DB.items.filter(it => {
      if (cat && it.category !== cat) return false;
      if (!q) return true;
      return it.name.toLowerCase().includes(q) || it.description.toLowerCase().includes(q);
    });

    document.getElementById('itemTableBody').innerHTML = filtered.map(it => `
      <tr>
        <td class="mono">#${it.id}</td>
        <td><span class="item-icon-sprite" style="${getItemSpriteStyle(it.id)}"></span></td>
        <td><strong>${it.name}</strong></td>
        <td><span class="badge badge-cyan">${it.category}</span></td>
        <td>${it.description}</td>
        <td class="mono">CLUT #${it.iconPalette}</td>
        <td class="mono" style="color:#fbbf24;">${it.handlerPtr}</td>
        <td><button class="nav-btn give-item-btn" data-id="${it.id}" style="padding:4px 8px; font-size:0.74rem;">+ Bag</button></td>
      </tr>
    `).join('');

    document.querySelectorAll('.give-item-btn').forEach(btn => {
      btn.onclick = () => {
        const itemId = parseInt(btn.dataset.id, 10);
        const existing = gameState.inventory.find(s => s.itemId === itemId);
        if (existing) existing.count++;
        else gameState.inventory.push({ itemId, count: 1 });
        renderInventory();
        btn.textContent = '✓ Added!';
        setTimeout(() => { btn.textContent = '+ Bag'; }, 900);
      };
    });
  }

  // Decoded Textures Grid
  document.getElementById('texturesGrid').innerHTML = DB.textures.map(tex => `
    <div class="texture-card">
      <img src="${tex.pngUrl}" alt="${tex.name}" class="pixelated" />
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong class="mono" style="color:#fbbf24;">${tex.name}</strong>
        <span class="badge badge-cyan">${tex.pmode}</span>
      </div>
      <div class="mono" style="font-size:0.74rem; color:var(--text-muted);">
        Path: ${tex.discPath} (LBA ${tex.lba})<br/>
        Dimensions: ${tex.width}×${tex.height}px • VRAM (${tex.vramX}, ${tex.vramY})
      </div>
    </div>
  `).join('');

  document.getElementById('searchDigimon').oninput = updateDigimonTable;
  document.getElementById('filterDigimonStage').onchange = updateDigimonTable;
  document.getElementById('filterDigimonType').onchange = updateDigimonTable;
  document.getElementById('searchTech').oninput = updateTechTable;
  document.getElementById('filterTechElement').onchange = updateTechTable;
  document.getElementById('searchItem').oninput = updateItemTable;
  document.getElementById('filterItemCat').onchange = updateItemTable;

  updateDigimonTable();
  updateTechTable();
  updateItemTable();
}

// Populate Disc Explorer & Live Sector Hex Viewer
async function initDiscExplorer() {
  const res = await fetch('/api/disc-files');
  DISC_INDEX = await res.json();
  document.getElementById('discCountBadge').textContent = `${DISC_INDEX.flatFiles.length} entries`;

  function renderDiscTable() {
    const q = (document.getElementById('searchDiscFile').value || '').toLowerCase();
    const list = DISC_INDEX.flatFiles.filter(f => !q || f.path.toLowerCase().includes(q)).slice(0, 250);
    document.getElementById('discFilesBody').innerHTML = list.map(f => `
      <tr>
        <td style="color:${f.type === 'directory' ? '#fbbf24' : '#e2e8f0'};">${f.type === 'directory' ? '📁 ' : '📄 '}${f.path}</td>
        <td>${f.type}</td>
        <td>${f.lba}</td>
        <td>${f.size.toLocaleString()}</td>
        <td>
          <button class="nav-btn inspect-hex-btn" data-lba="${f.lba}" data-size="${f.size}" data-path="${f.path}" style="padding:3px 8px; font-size:0.72rem;">Hex</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.inspect-hex-btn').forEach(btn => {
      btn.onclick = () => loadDiscHex(btn.dataset.lba, btn.dataset.size, btn.dataset.path);
    });
  }

  document.getElementById('searchDiscFile').oninput = renderDiscTable;
  renderDiscTable();
  loadDiscHex(23, 68, 'SYSTEM.CNF');
}

async function loadDiscHex(lba, size, pathName) {
  document.getElementById('hexTargetBadge').textContent = `${pathName} (LBA ${lba}, ${Number(size).toLocaleString()} B)`;
  const res = await fetch(`/api/disc-hex?lba=${lba}&size=${size}&offset=0`);
  const data = await res.json();
  document.getElementById('hexViewerBody').innerHTML = data.rows.map(r => `
    <tr>
      <td style="color:#38bdf8;">${r.offset}</td>
      <td style="color:#e2e8f0;">${r.hex}</td>
      <td style="color:#fbbf24;">${r.ascii.replace(/</g, '&lt;')}</td>
    </tr>
  `).join('');
}

// Boot & Wire Event Listeners
async function init() {
  const res = await fetch('/data/reverse-engineered-db.json');
  DB = await res.json();

  // Populate partner selector
  const partnerSel = document.getElementById('partnerSpeciesSelect');
  partnerSel.innerHTML = DB.digimon.filter(d => d.id >= 1).map(d =>
    `<option value="${d.id}" ${d.id === 3 ? 'selected' : ''}>#${d.id} ${d.name} (${d.level} • ${d.modelCode})</option>`
  ).join('');
  partnerSel.onchange = () => {
    gameState.partnerId = parseInt(partnerSel.value, 10);
    updateVpetUI();
    addLog(`🧬 Loaded ROM struct ${getPartner().structOffset} for <strong>${getPartner().name}</strong>!`, '#fbbf24');
  };

  // Main navigation tabs
  document.querySelectorAll('#mainNav .nav-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#mainNav .nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    };
  });

  // DB Sub-navigation tabs
  document.querySelectorAll('#dbSubNav .nav-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#dbSubNav .nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.db-subpane').forEach(p => { p.style.display = 'none'; });
      btn.classList.add('active');
      document.getElementById(btn.dataset.subtab).style.display = 'block';
    };
  });

  // V-Pet Actions
  document.getElementById('vpetAreaSelect').onchange = (e) => {
    gameState.area = e.target.value;
    gameState.mode = 'field';
    gameState.enemy = null;
    document.getElementById('vpetLocationBadge').textContent = gameState.area;
    addLog(`🗺️ Traveled to <strong>${gameState.area}</strong>.`, '#38bdf8');
  };

  document.getElementById('toggleCrtBtn').onclick = () => {
    document.getElementById('vpetViewport').classList.toggle('crt');
  };

  document.getElementById('btnFeedMeat').onclick = () => {
    const p = getPartner();
    gameState.weight += 2;
    gameState.happiness = Math.min(100, gameState.happiness + 6);
    gameState.hp = Math.min(gameState.maxHp, gameState.hp + 250);
    spawnFloatingText(145, 105, '🍖 +2G Weight!', '#fbbf24');
    addLog(`🍖 Fed File City Meat to <strong>${p.name}</strong>! Weight is now ${gameState.weight}G.`, '#fbbf24');
    updateVpetUI();
  };

  document.getElementById('btnTrainGym').onclick = () => {
    const p = getPartner();
    gameState.offense = Math.min(999, gameState.offense + 18);
    gameState.defense = Math.min(999, gameState.defense + 15);
    gameState.speed = Math.min(999, gameState.speed + 16);
    gameState.brains = Math.min(999, gameState.brains + 16);
    gameState.maxHp += 90;
    gameState.maxMp += 75;
    gameState.hp = gameState.maxHp;
    gameState.mp = gameState.maxMp;
    gameState.fatigue = Math.min(100, gameState.fatigue + 12);
    gameState.hour = (gameState.hour + 1) % 24;
    if (gameState.hour === 0) gameState.day++;
    spawnFloatingText(145, 100, '🏋️ BONUS TRY! STATS UP!', '#34d399');
    addLog(`🏋️ Green Gym Roulette Bonus! ${p.name}'s Offense, Defense, Speed, Brains & Max HP/MP increased!`, '#34d399');
    updateVpetUI();
  };

  document.getElementById('btnPraise').onclick = () => {
    gameState.happiness = Math.min(100, gameState.happiness + 12);
    gameState.discipline = Math.min(100, gameState.discipline + 8);
    spawnFloatingText(145, 105, '🎵 Happy +12%!', '#fbbf24');
    addLog(`🎵 Praised ${getPartner().name}! Happiness: ${gameState.happiness}%, Discipline: ${gameState.discipline}%.`, '#fbbf24');
    updateVpetUI();
  };

  document.getElementById('btnRest').onclick = () => {
    gameState.fatigue = 0;
    gameState.hp = gameState.maxHp;
    gameState.mp = gameState.maxMp;
    gameState.hour = (gameState.hour + 8) % 24;
    gameState.day++;
    if (Math.random() < 0.45) gameState.poopCount = Math.min(4, gameState.poopCount + 1);
    spawnFloatingText(145, 105, '💤 Full Recovery!', '#38bdf8');
    addLog(`💤 ${getPartner().name} slept at Punimon's Chair! HP/MP fully restored and Fatigue cleared!`, '#38bdf8');
    updateVpetUI();
  };

  document.getElementById('btnCleanPoop').onclick = () => {
    gameState.poopCount = 0;
    gameState.discipline = Math.min(100, gameState.discipline + 5);
    spawnFloatingText(145, 105, '✨ Sparkling Clean!', '#34d399');
    addLog(`🚽 Took ${getPartner().name} to the Portable Potty! Virus gauge reset.`, '#34d399');
    updateVpetUI();
  };

  document.getElementById('btnExploreBattle').onclick = () => {
    startWildBattle();
  };

  document.getElementById('btnDigivolveNow').onclick = () => {
    const cur = getPartner();
    // Natural progression chain or next stage in SLES_029.14
    const nextMap = {
      1: 2,  // Botamon -> Koromon
      2: 3,  // Koromon -> Agumon
      3: 5,  // Agumon -> Greymon
      4: 10, // Betamon -> Seadramon
      5: 12, // Greymon -> MetalGreymon
      6: 26, // Devimon -> SkullGreymon
      7: 50, // Airdramon -> Megadramon
      8: 12, // Tyrannomon -> MetalGreymon
      9: 37, // Meramon -> Andromon
      10: 56,// Seadramon -> MegaSeadramon
      11: 14,// Numemon -> Monzaemon
      12: 1, // MetalGreymon -> Rebirth Botamon
      15: 16,// Punimon -> Tsunomon
      16: 17,// Tsunomon -> Gabumon
      17: 22,// Gabumon -> Garurumon
      22: 26 // Garurumon -> SkullGreymon
    };
    const nextId = nextMap[cur.id] || ((cur.id % 61) + 1);
    const nextDigi = DB.digimon.find(d => d.id === nextId) || DB.digimon[5];
    gameState.partnerId = nextDigi.id;
    gameState.maxHp += 650;
    gameState.hp = gameState.maxHp;
    gameState.maxMp += 500;
    gameState.mp = gameState.maxMp;
    gameState.offense = Math.min(999, gameState.offense + 90);
    gameState.defense = Math.min(999, gameState.defense + 85);
    document.getElementById('partnerSpeciesSelect').value = String(nextDigi.id);
    spawnFloatingText(240, 85, `✨ DIGIVOLVED TO ${nextDigi.name.toUpperCase()}!`, '#fbbf24');
    addLog(`✨ EVOLUTION (EVL_REL.BIN): <strong>${cur.name}</strong> digivolved into <strong>${nextDigi.name}</strong> (${nextDigi.level}, ${nextDigi.modelFile})!`, '#fbbf24');
    updateVpetUI();
  };

  document.getElementById('btnAddStarterPack').onclick = () => {
    [39, 1, 5, 69, 70, 91].forEach(id => {
      const slot = gameState.inventory.find(s => s.itemId === id);
      if (slot) slot.count += 2;
      else gameState.inventory.push({ itemId: id, count: 2 });
    });
    renderInventory();
    addLog(`🎒 Jijimon restocked your Tamer Bag with Sirloin, Recovery Floppies, Chain Melon & Evolution Items!`, '#34d399');
  };

  // PS1 WebAssembly Emulator Launchers
  function launchPs1Core() {
    const container = document.getElementById('emuContainer');
    container.innerHTML = `<iframe src="/emulator.html" allow="autoplay; fullscreen; gamepad" title="Digimon World PS1 Emulator"></iframe>`;
  }
  document.getElementById('btnLaunchPs1Emu').onclick = launchPs1Core;
  document.getElementById('btnLaunchPs1EmuCenter').onclick = launchPs1Core;
  document.getElementById('btnReloadPs1Emu').onclick = launchPs1Core;

  // MIPS Disassembler controls
  document.getElementById('btnDisasmGo').onclick = () => {
    loadMipsDisassembly(document.getElementById('mipsAddrInput').value);
  };
  document.querySelectorAll('.mips-preset').forEach(btn => {
    btn.onclick = () => {
      document.getElementById('mipsAddrInput').value = btn.dataset.addr;
      loadMipsDisassembly(btn.dataset.addr);
    };
  });

  addLog(`✅ Loaded REA Evidence (${DB.rea.evidenceId.slice(0, 18)}…) & SLES_029.14 binary structs (127 Digimon, 121 Techniques, 128 Items, 14 PS1 .TIM textures).`, '#34d399');
  addLog(`🏝️ Welcome to File Island! Raise <strong>Agumon</strong>, use items with real <code>ITEM.TIM</code> sprites, or switch to the <strong>Full PS1 ROM Emulator</strong> tab!`, '#fbbf24');

  updateVpetUI();
  startCanvasLoop();
  renderReaAndExeTab();
  renderRomDatabaseTab();
  initDiscExplorer();
}

window.addEventListener('DOMContentLoaded', init);
