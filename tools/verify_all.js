const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dataPath = path.join(__dirname, '..', 'app', 'data.js');
if (!fs.existsSync(dataPath)) {
  console.error('ERROR: app/data.js not found:', dataPath);
  process.exit(1);
}

const code = fs.readFileSync(dataPath, 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(code + '\nthis.SHIPS_DATA = SHIPS_DATA;', context);

const ships = context.SHIPS_DATA;
if (!Array.isArray(ships)) {
  console.error('ERROR: SHIPS_DATA is not an array');
  process.exit(1);
}

const VALID_RARITIES = new Set(['UR', 'SSR', 'SR', 'R', 'N']);
const VALID_PLANS = new Set(['PR', 'DR']);
const EQUIP_LABEL_RE = /\(T[0-3]\)|^e\d+_\d+|^\d{3}-\d+/i;
const seenIds = new Set();
const errors = [];
const warnings = [];

let totalImages = 0;
const rarityCounts = {};
const planCounts = { UR_NORMAL: 0, DR: 0, PR: 0 };
const factionCounts = {};

ships.forEach((s, idx) => {
  const prefix = `[#${idx} ${s.id || '?'} ${s.name || '?'}]`;

  if (!s.id || typeof s.id !== 'string') {
    errors.push(`${prefix} Missing or invalid id`);
  } else if (seenIds.has(s.id)) {
    errors.push(`${prefix} Duplicate id: ${s.id}`);
  } else {
    seenIds.add(s.id);
  }

  for (const field of ['name', 'rarity', 'type', 'faction']) {
    if (!s[field] || typeof s[field] !== 'string' || !s[field].trim()) {
      errors.push(`${prefix} Missing required field: ${field}`);
    }
  }

  if (s.rarity && !VALID_RARITIES.has(s.rarity)) {
    errors.push(`${prefix} Invalid rarity: ${s.rarity}`);
  }
  if (s.plan !== undefined && s.plan !== null && !VALID_PLANS.has(s.plan)) {
    errors.push(`${prefix} Invalid plan: ${s.plan}`);
  }

  if (!s.sourceInfo || typeof s.sourceInfo !== 'object') {
    errors.push(`${prefix} Missing sourceInfo`);
  } else {
    if (!s.sourceInfo.url || !/^https?:\/\//.test(s.sourceInfo.url)) {
      errors.push(`${prefix} Invalid sourceInfo.url: ${s.sourceInfo.url}`);
    }
    if (!s.sourceInfo.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.sourceInfo.date)) {
      errors.push(`${prefix} Invalid sourceInfo.date: ${s.sourceInfo.date}`);
    }
  }

  if (!Array.isArray(s.images) || s.images.length === 0) {
    errors.push(`${prefix} Missing images`);
  } else {
    totalImages += s.images.length;
    s.images.forEach((img, iIdx) => {
      if (!img.label || !img.url || !img.source || !img.credit) {
        errors.push(`${prefix} Image[${iIdx}] missing required metadata (label/url/source/credit)`);
      } else if (EQUIP_LABEL_RE.test(img.label.trim())) {
        errors.push(`${prefix} Image[${iIdx}] looks like equipment/code label: "${img.label}"`);
      }
    });
  }

  if (!Array.isArray(s.skills)) {
    errors.push(`${prefix} skills must be an array`);
  } else if (s.skills.length === 0) {
    warnings.push(`${prefix} skills is empty`);
  }

  const rawJson = JSON.stringify(s);
  if (rawJson.includes('少女ウォーズ')) {
    errors.push(`${prefix} Contaminated with unrelated game data`);
  }

  rarityCounts[s.rarity] = (rarityCounts[s.rarity] || 0) + 1;
  if (s.plan === 'DR') planCounts.DR += 1;
  else if (s.plan === 'PR') planCounts.PR += 1;
  else if (s.rarity === 'UR') planCounts.UR_NORMAL += 1;
  factionCounts[s.faction] = (factionCounts[s.faction] || 0) + 1;
});

console.log('=== verify_all.js Report ===');
console.log(`Total ships: ${ships.length}`);
console.log(`Total images: ${totalImages}`);
console.log('By rarity:', rarityCounts);
console.log('UR breakdown:', { '通常UR': planCounts.UR_NORMAL, '計画艦DR': planCounts.DR });
console.log('By faction:', factionCounts);

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`);
  warnings.forEach(w => console.log('  WARN:', w));
}

if (errors.length > 0) {
  console.error(`\nErrors (${errors.length}):`);
  errors.forEach(e => console.error('  ERR:', e));
  process.exit(1);
}

console.log('\nALL CHECKS PASSED.');
process.exit(0);
