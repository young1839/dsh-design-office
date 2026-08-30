/**
 * 离线素材包生成：下载 50+ 常用精选图标到 assets/icons/（断网 Tier 2 兜底）
 *
 * 全部来自 Iconify mdi 集（Apache-2.0），按中英关键词精选
 * 文件名 = 语义名.svg（如 car.svg）
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, '..', 'assets', 'icons');

/** 精选图标：语义名 → Iconify ID（mdi 集，Apache-2.0） */
const ICONS = {
  car: 'mdi:car',
  'car-electric': 'mdi:car-electric',
  rocket: 'mdi:rocket',
  chip: 'mdi:chip',
  cloud: 'mdi:cloud',
  code: 'mdi:code-tags',
  database: 'mdi:database',
  chart: 'mdi:chart-bar',
  'chart-line': 'mdi:chart-line',
  'chart-pie': 'mdi:chart-pie',
  growth: 'mdi:trending-up',
  target: 'mdi:target',
  flag: 'mdi:flag',
  finance: 'mdi:finance',
  wallet: 'mdi:wallet',
  money: 'mdi:cash',
  education: 'mdi:school',
  book: 'mdi:book-open',
  graduation: 'mdi:graduation-cap',
  medical: 'mdi:medical-bag',
  health: 'mdi:heart-pulse',
  hospital: 'mdi:hospital-building',
  factory: 'mdi:factory',
  industry: 'mdi:industrial',
  gear: 'mdi:cog',
  machine: 'mdi:engine',
  data: 'mdi:data-matrix',
  analytics: 'mdi:chart-areaspline',
  team: 'mdi:account-group',
  users: 'mdi:account-multiple',
  people: 'mdi:account',
  market: 'mdi:store',
  report: 'mdi:file-document',
  contract: 'mdi:file-sign',
  document: 'mdi:file',
  clipboard: 'mdi:clipboard-text',
  resume: 'mdi:badge-account',
  cv: 'mdi:card-account-details',
  person: 'mdi:account-circle',
  paper: 'mdi:file-pdf',
  thesis: 'mdi:book-variant',
  presentation: 'mdi:presentation',
  slide: 'mdi:projector-screen',
  screen: 'mdi:monitor',
  monitor: 'mdi:desktop-classic',
  clock: 'mdi:clock',
  time: 'mdi:clock-outline',
  calendar: 'mdi:calendar',
  schedule: 'mdi:calendar-clock',
  location: 'mdi:map-marker',
  'map-pin': 'mdi:map-marker-radius',
  place: 'mdi:map',
  pin: 'mdi:pin',
  phone: 'mdi:phone',
  call: 'mdi:phone-classic',
  mobile: 'mdi:cellphone',
  email: 'mdi:email',
  mail: 'mdi:email-outline',
  envelope: 'mdi:email-fast',
  search: 'mdi:magnify',
  magnifier: 'mdi:magnify-plus',
  zoom: 'mdi:magnify-minus',
  download: 'mdi:download',
  'arrow-down': 'mdi:arrow-down',
  upload: 'mdi:upload',
  'arrow-up': 'mdi:arrow-up',
  security: 'mdi:shield-lock',
  shield: 'mdi:shield',
  lock: 'mdi:lock',
  safe: 'mdi:shield-check',
  leaf: 'mdi:leaf',
  eco: 'mdi:leaf-circle',
  recycle: 'mdi:recycle',
  plant: 'mdi:sprout',
  energy: 'mdi:lightning-bolt',
  bolt: 'mdi:bolt',
  power: 'mdi:power',
  flame: 'mdi:fire',
  building: 'mdi:office-building',
  home: 'mdi:home',
  city: 'mdi:city',
  construction: 'mdi:construction',
  truck: 'mdi:truck',
  shipping: 'mdi:ship',
  package: 'mdi:package',
  delivery: 'mdi:motorbike',
  star: 'mdi:star',
  check: 'mdi:check',
  'check-circle': 'mdi:check-circle',
  alert: 'mdi:alert',
  info: 'mdi:information',
  lightbulb: 'mdi:lightbulb',
  idea: 'mdi:lightbulb-on',
  bulb: 'mdi:lightbulb-outline',
  trophy: 'mdi:trophy',
  award: 'mdi:medal',
  medal: 'mdi:medal-outline',
  globe: 'mdi:earth',
  world: 'mdi:earth-plus',
  link: 'mdi:link',
  chain: 'mdi:link-variant',
  settings: 'mdi:cog-outline',
  config: 'mdi:tune',
  tools: 'mdi:tools',
  wrench: 'mdi:wrench',
  key: 'mdi:key',
  password: 'mdi:key-variant',
  user: 'mdi:account-box',
  'user-plus': 'mdi:account-plus',
  logout: 'mdi:logout',
  login: 'mdi:login',
  refresh: 'mdi:refresh',
  sync: 'mdi:sync',
  update: 'mdi:update',
  save: 'mdi:content-save',
  print: 'mdi:printer',
  share: 'mdi:share-variant',
  send: 'mdi:send',
  camera: 'mdi:camera',
  image: 'mdi:image',
  photo: 'mdi:image-outline',
  video: 'mdi:video',
  music: 'mdi:music',
  audio: 'mdi:volume-high',
  play: 'mdi:play',
  pause: 'mdi:pause',
  stop: 'mdi:stop',
  heart: 'mdi:heart',
  love: 'mdi:heart-outline',
  smile: 'mdi:emoticon-happy',
  sad: 'mdi:emoticon-sad',
  question: 'mdi:help-circle',
  help: 'mdi:lifebuoy',
  support: 'mdi:headset',
  chat: 'mdi:chat',
  message: 'mdi:message',
  comment: 'mdi:comment',
  bell: 'mdi:bell',
  notification: 'mdi:bell-outline',
  menu: 'mdi:menu',
  list: 'mdi:format-list-bulleted',
  grid: 'mdi:view-grid',
  table: 'mdi:table',
  filter: 'mdi:filter',
  sort: 'mdi:sort',
  more: 'mdi:dots-horizontal',
  plus: 'mdi:plus',
  minus: 'mdi:minus',
  close: 'mdi:close',
  delete: 'mdi:delete',
  trash: 'mdi:trash-can',
  edit: 'mdi:pencil',
  pencil: 'mdi:lead-pencil',
  copy: 'mdi:content-copy',
  paste: 'mdi:content-paste',
  cut: 'mdi:content-cut',
  undo: 'mdi:undo',
  redo: 'mdi:redo',
  history: 'mdi:history',
  bookmark: 'mdi:bookmark',
  favorite: 'mdi:star-circle',
  fire: 'mdi:fire-circle',
  sun: 'mdi:weather-sunny',
  moon: 'mdi:weather-night',
  weather: 'mdi:weather-partly-cloudy',
  rain: 'mdi:weather-rainy',
  snow: 'mdi:weather-snowy',
  wind: 'mdi:weather-windy',
};

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });
  let ok = 0;
  let fail = 0;
  const entries = Object.entries(ICONS);
  console.log(`开始下载 ${entries.length} 个精选图标...`);

  // 并发 5
  const concurrency = 5;
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ([name, id]) => {
        const file = path.join(ICONS_DIR, `${name}.svg`);
        try {
          const existing = await readFile(file).catch(() => null);
          if (existing) {
            ok++;
            return;
          }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
          const res = await fetch(`https://api.iconify.design/${id}.svg`, { signal: controller.signal });
          clearTimeout(timer);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const svg = await res.text();
          if (!svg.includes('<svg')) throw new Error('非法 SVG');
          await writeFile(file, svg);
          ok++;
        } catch (e) {
          fail++;
          console.log(`  ✗ ${name} (${id}): ${String(e).slice(0, 60)}`);
        }
      }),
    );
    process.stdout.write(`\r  进度: ${Math.min(i + concurrency, entries.length)}/${entries.length}`);
  }

  console.log(`\n完成: ✓ ${ok} 成功, ✗ ${fail} 失败`);
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'Iconify mdi (Apache-2.0)',
    count: ok,
    ids: Object.fromEntries(Object.entries(ICONS).filter(([n]) => ok >= 0)),
  };
  await writeFile(path.join(ICONS_DIR, '.icons-manifest.json'), JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
