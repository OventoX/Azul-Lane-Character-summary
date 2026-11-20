import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, 'tools', 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)

TODAY = datetime.now().strftime('%Y-%m-%d')
WIKIRU_BASE = 'https://azurlane.wikiru.jp/'

FACTION_MAP = {
    'ユニオン': 'ユニオン',
    'ロイヤル': 'ロイヤル',
    '重桜': '重桜',
    '鉄血': '鉄血',
    '東煌': '東煌',
    'サディア': 'サディア',
    'サディア帝国': 'サディア',
    'アイリス': 'アイリス',
    '自由アイリス教国': 'アイリス',
    'ヴィシア': 'ヴィシア',
    'ヴィシア聖座': 'ヴィシア',
    '北方連合': '北方連合',
    '北連': '北方連合',
    'チュリッパ': 'その他・コラボ',
    'ペドレリーア': 'その他・コラボ',
    '他': 'その他・コラボ',
    'その他': 'その他・コラボ',
}

TYPE_MAP = {
    '駆逐': '駆逐',
    '駆逐艦': '駆逐',
    '軽巡': '軽巡',
    '軽巡洋艦': '軽巡',
    '重巡': '重巡',
    '重巡洋艦': '重巡',
    '超巡': '超巡',
    '超甲巡': '超巡',
    '戦艦': '戦艦',
    '巡戦': '巡洋戦艦',
    '巡洋戦艦': '巡洋戦艦',
    '航戦': '航空戦艦',
    '航空戦艦': '航空戦艦',
    '空母': '空母',
    '正規空母': '空母',
    '軽母': '軽空母',
    '軽空母': '軽空母',
    '潜水': '潜水艦',
    '潜水艦': '潜水艦',
    '潜母': '潜水空母',
    '潜水空母': '潜水空母',
    '工作': '工作',
    '運送': '輸送',
    '輸送': '輸送',
    '補給': '補給',
}


def fetch_cached(url, sleep_sec=0.25):
    key = hashlib.sha256(url.encode('utf-8')).hexdigest()[:20]
    cache_path = os.path.join(CACHE_DIR, f'{key}.html')
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return f.read()
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    with urllib.request.urlopen(req, timeout=25) as r:
        content = r.read().decode('utf-8', 'ignore')
    with open(cache_path, 'w', encoding='utf-8') as f:
        f.write(content)
    time.sleep(sleep_sec)
    return content


def get_fandom_map():
    url = 'https://blhx.fandom.com/api.php?action=parse&page=Full_Ship_List&prop=text&format=json'
    raw = fetch_cached(url, sleep_sec=0.1)
    data = json.loads(raw)
    html = data['parse']['text']['*']
    soup = BeautifulSoup(html, 'html.parser')
    fmap = {}
    for tr in soup.find_all('tr'):
        tds = [td.get_text(' ', strip=True) for td in tr.find_all(['td', 'th'])]
        if len(tds) >= 7 and tds[6] in ('Ultra Rare', 'Decisive'):
            no = tds[1].strip()
            name_en = tds[3].strip()
            ship_class = tds[4].strip()
            fmap[name_en.lower()] = {
                'no': no,
                'nameEn': name_en,
                'classEn': ship_class,
                'url': f'https://blhx.fandom.com/wiki/{urllib.parse.quote(name_en.replace(" ", "_"))}'
            }
    return fmap


def normalize_url(href):
    if href.startswith('http'):
        return href
    if href.startswith('./'):
        return WIKIRU_BASE + href[2:]
    if href.startswith('/'):
        return 'https://azurlane.wikiru.jp' + href
    return WIKIRU_BASE + href


def parse_name_en(raw_name, jp_name):
    # e.g. "武蔵 IJN Musashi" or "ニュージャージー USS New Jersey"
    s = raw_name.strip()
    if s.startswith(jp_name):
        s = s[len(jp_name):].strip()
    # Remove leading faction prefix if present
    s = re.sub(r'^(USS|HMS|IJN|KMS|SN|ROC|RN|FFNF|MNF|UNIV|MOT|HNLMS)\s+', '', s).strip()
    return s


def is_valid_chara_img(src, alt, allow_profile_fallback=False):
    if not src or 'attach2/' not in src:
        return False
    low = src.lower()
    allowed_exts = ('.jpg', '.jpeg', '.png', '.webp') if allow_profile_fallback else ('.jpg', '.jpeg', '.png')
    if not low.endswith(allowed_exts):
        return False
    fname = src.split('/')[-1]
    # Exclude skill icons, SDs, banners, equipment icons
    if fname.startswith('696D67_') and not allow_profile_fallback:
        return False
    base_alt = re.sub(r'\.(jpg|jpeg|png|webp)$', '', alt.strip(), flags=re.IGNORECASE)
    if '_SD' in alt or '_sd' in alt.lower() or base_alt.endswith('SD') or 'icon' in alt.lower():
        return False
    # Exclude animated Live2D preview webp unless specifically fallback
    if low.endswith('.webp') and ('fps' in alt.lower() or 'live2d' in alt.lower()):
        return False
    # Exclude equipment / code-name patterns
    if re.search(r'\(T[0-3]\)|^e\d+_\d+|^\d{3}-\d+', alt.strip(), re.IGNORECASE):
        return False
    return True


def clean_skin_label(raw_label, jp_name, has_default):
    label = re.sub(r'\.(jpg|jpeg|png)$', '', raw_label, flags=re.IGNORECASE).strip()
    if not label or label == jp_name or label == f'{jp_name}_2':
        return '通常' if not has_default else '別立ち絵'
    # Fix unmatched trailing ')' if '(' is not present (rare wiki typo)
    if ')' in label and '(' not in label and '（' not in label:
        label = label.replace(')', '')
    return label


def parse_ship_page(jp_name, page_url, rarity_raw, type_hint, impl_date, acq_hint):
    html = fetch_cached(page_url)
    soup = BeautifulSoup(html, 'html.parser')
    body = soup.find('div', id='body') or soup

    profile = {}
    ship_class = ''
    acquisition_parts = []
    skills = []

    for table in body.find_all('table'):
        rows = table.find_all('tr')
        if not rows:
            continue
        first_txt = rows[0].get_text(' ', strip=True)

        # Profile table
        if first_txt == 'プロフィール':
            for tr in rows[1:]:
                cells = tr.find_all(['th', 'td'])
                if len(cells) >= 2:
                    # Sometimes first cell is image (rowspan)
                    texts = [c.get_text(' ', strip=True) for c in cells]
                    for idx in range(len(texts) - 1):
                        k = texts[idx]
                        v = texts[idx + 1]
                        if k in ('名前', 'レアリティ', '艦種', '陣営', 'CV', 'イラスト'):
                            profile[k] = v

        # Acquisition table
        elif first_txt == '入手方法':
            for tr in rows[1:]:
                cells = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
                if len(cells) >= 2:
                    acquisition_parts.append(f'{cells[0]}: {cells[1]}')
                elif cells:
                    acquisition_parts.append(cells[0])

        # Fleet tech table -> 艦級
        elif first_txt == '艦船技術':
            for tr in rows[1:]:
                cells = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
                if len(cells) >= 2 and cells[0] == '艦級':
                    cls = re.sub(r'^T\d+\s*', '', cells[1]).strip()
                    ship_class = cls

        # Skill table (pattern A: ['', 'スキル名', '効果'], pattern B: ['スキル'] or ['', 'スキル'] with 2 rows per skill)
        elif any(h in first_txt for h in ('スキル名', '効果')) and '全弾発射' not in first_txt:
            for tr in rows[1:]:
                cells = tr.find_all(['th', 'td'])
                if len(cells) >= 3:
                    sname = cells[1].get_text(' ', strip=True)
                    sdesc = cells[2].get_text(' ', strip=True)
                    if sname and sdesc and sname != '-':
                        skills.append({'name': sname, 'desc': sdesc})
        elif first_txt.strip() in ('スキル', 'スキル名'):
            idx = 1
            while idx < len(rows):
                cells = rows[idx].find_all(['th', 'td'])
                if len(cells) >= 2:
                    sname = cells[1].get_text(' ', strip=True)
                    sdesc = ''
                    if len(cells) >= 3:
                        sdesc = cells[2].get_text(' ', strip=True)
                    elif idx + 1 < len(rows):
                        next_cells = rows[idx + 1].find_all(['th', 'td'])
                        if len(next_cells) == 1:
                            sdesc = next_cells[0].get_text(' ', strip=True)
                            idx += 1
                    if sname and sdesc and sname != '-':
                        skills.append({'name': sname, 'desc': sdesc})
                idx += 1

    # Images extraction
    images = []
    seen_urls = set()

    def add_img(label, src):
        full_url = normalize_url(src)
        if full_url not in seen_urls:
            seen_urls.add(full_url)
            images.append({
                'label': label,
                'url': full_url,
                'source': 'アズールレーン攻略Wiki (wikiru)',
                'credit': '© Manjuu / Yongshi / Yostar（出典: azurlane.wikiru.jp）'
            })

    # 1. Profile default image (first pass: strict, second pass: allow 696D67_ / static webp fallback)
    for allow_fb in (False, True):
        if images:
            break
        for table in body.find_all('table'):
            rows = table.find_all('tr')
            if rows and rows[0].get_text(' ', strip=True) == 'プロフィール':
                for img in table.find_all('img'):
                    src = img.get('data-src') or img.get('src') or ''
                    alt = img.get('alt') or ''
                    if is_valid_chara_img(src, alt, allow_profile_fallback=allow_fb):
                        add_img('通常', src)
                        break
                break

    # 2. Oath & Skins: ONLY scan sections before ゲームにおいて / 元ネタ / コメント
    # Specifically: Oath headings (h2/h3) and the 着せ替え h2 section
    for h in body.find_all(['h2', 'h3']):
        htext = h.get_text(' ', strip=True)
        m_oath = re.search(r'ケッコン後\(([^)]+)\)', htext)
        if m_oath:
            oath_name = m_oath.group(1).strip()
            for sib in [h.find_previous_sibling(), h.find_next_sibling()]:
                if sib and hasattr(sib, 'find_all'):
                    for img in sib.find_all('img'):
                        src = img.get('data-src') or img.get('src') or ''
                        alt = img.get('alt') or ''
                        if is_valid_chara_img(src, alt):
                            add_img(f'ケッコン：{oath_name}', src)

    # 3. Scan <h2>着せ替え</h2> section (between <h2>着せ替え</h2> and next <h2>)
    # Also scan <h2>基本情報</h2> section for any fallback default portrait (if not found in profile table)
    current_h2 = ''
    for el in body.children:
        if getattr(el, 'name', None) == 'h2':
            current_h2 = el.get_text(' ', strip=True)
            continue
        if not hasattr(el, 'find_all'):
            continue
        if '着せ替え' in current_h2 or (not images and '基本情報' in current_h2):
            for img in el.find_all('img'):
                src = img.get('data-src') or img.get('src') or ''
                alt = img.get('alt') or ''
                if not is_valid_chara_img(src, alt):
                    continue
                full_url = normalize_url(src)
                if full_url in seen_urls:
                    continue
                label = clean_skin_label(alt, jp_name, bool(images))
                add_img(label, src)

    raw_name = profile.get('名前', jp_name)
    name_en = parse_name_en(raw_name, jp_name)
    raw_faction = profile.get('陣営', '')
    faction = FACTION_MAP.get(raw_faction, 'その他・コラボ')
    raw_type = profile.get('艦種', type_hint)
    ship_type = TYPE_MAP.get(raw_type, raw_type)

    if rarity_raw == 'DR':
        rarity = 'UR'
        plan = 'DR'
    else:
        rarity = 'UR'
        plan = None

    acquisition = ' / '.join(acquisition_parts) if acquisition_parts else acq_hint
    if rarity_raw == 'DR' and '開発ドック' not in acquisition:
        acquisition = f'開発ドック（{acq_hint}）' if acq_hint and acq_hint != '開発ドック' else '開発ドック（科学研究）'

    return {
        'jp_name': jp_name,
        'nameEn': name_en,
        'class': ship_class,
        'rarity': rarity,
        'plan': plan,
        'type': ship_type,
        'faction': faction,
        'factionRaw': raw_faction,
        'cv': profile.get('CV', ''),
        'illustrator': profile.get('イラスト', ''),
        'skills': skills[:4],
        'acquisition': acquisition,
        'implDate': impl_date,
        'sourceUrl': page_url,
        'images': images,
    }


def main():
    fandom_map = get_fandom_map()
    print(f'Fandom UR/DR entries: {len(fandom_map)}')

    hist_url = 'https://azurlane.wikiru.jp/?%E6%96%B0%E3%82%AD%E3%83%A3%E3%83%A9%E3%83%BB%E6%94%B9%E9%80%A0%E3%82%AD%E3%83%A3%E3%83%A9%E3%81%AE%E5%AE%9F%E8%A3%85%E5%B1%A5%E6%AD%B4'
    html = fetch_cached(hist_url)
    soup = BeautifulSoup(html, 'html.parser')
    body = soup.find('div', id='body') or soup

    targets = []
    for tr in body.find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) >= 3:
            texts = [td.get_text(' ', strip=True) for td in tds]
            if texts[1] in ('UR', 'DR'):
                ship_name = texts[2]
                # Exclude SSR->UR retrofits (e.g. ベルファスト改)
                if ship_name.endswith('改'):
                    continue
                a = tds[2].find('a', href=True)
                if not a:
                    continue
                page_url = normalize_url(a['href'])
                dates = [t for t in texts[3:-1] if t and t != '-']
                impl_date = dates[0] if dates else ''
                acq_hint = texts[-1] if len(texts) > 3 else ''
                targets.append((ship_name, page_url, texts[1], texts[0], impl_date, acq_hint))

    print(f'Target UR/DR ships (excluding retrofits): {len(targets)}')

    records = []
    # Assign deterministic IDs: use Fandom No. when available, otherwise AL-UR-xx / AL-DR-xx
    # Sort chronologically (oldest first) for clean numbering of newer ships
    ur_seq = 1
    dr_seq = 1
    for jp_name, page_url, rarity_raw, type_hint, impl_date, acq_hint in reversed(targets):
        parsed = parse_ship_page(jp_name, page_url, rarity_raw, type_hint, impl_date, acq_hint)
        f_info = fandom_map.get(parsed['nameEn'].lower())
        if f_info and f_info['no']:
            ship_id = f"AL-{f_info['no']}"
            if not parsed['class'] and f_info['classEn']:
                parsed['class'] = f_info['classEn']
        else:
            if rarity_raw == 'DR':
                ship_id = f'AL-DR{dr_seq:02d}'
                dr_seq += 1
            else:
                ship_id = f'AL-UR{ur_seq:02d}'
                ur_seq += 1
        if rarity_raw == 'DR':
            dr_seq = max(dr_seq, 1)

        rec = {
            'id': ship_id,
            'name': parsed['jp_name'],
            'nameEn': parsed['nameEn'],
            'class': parsed['class'],
            'rarity': parsed['rarity'],
        }
        if parsed['plan']:
            rec['plan'] = parsed['plan']
        rec.update({
            'type': parsed['type'],
            'faction': parsed['faction'],
            'cv': parsed['cv'],
            'illustrator': parsed['illustrator'],
            'skills': parsed['skills'],
            'acquisition': parsed['acquisition'],
            'sourceInfo': {
                'url': parsed['sourceUrl'],
                'date': TODAY,
            },
            'images': parsed['images'],
        })
        records.append(rec)

    # Check ID uniqueness
    ids = [r['id'] for r in records]
    assert len(ids) == len(set(ids)), f'Duplicate IDs found: {ids}'

    # Print summary diagnostics
    no_img = [r['name'] for r in records if not r['images']]
    no_skills = [r['name'] for r in records if not r['skills']]
    no_class = [r['name'] for r in records if not r['class']]
    no_cv = [r['name'] for r in records if not r['cv']]
    print(f'Built {len(records)} records.')
    print(f'Missing images ({len(no_img)}): {no_img}')
    print(f'Missing skills ({len(no_skills)}): {no_skills}')
    print(f'Missing class ({len(no_class)}): {no_class}')
    print(f'Missing CV ({len(no_cv)}): {no_cv}')

    out_path = os.path.join(BASE_DIR, 'app', 'data.js')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// アズールレーン 艦船まとめ表 データベース (Generated by tools/build_data.py)\n')
        f.write(f'// Last updated: {TODAY}\n')
        f.write('const SHIPS_DATA = ')
        json.dump(records, f, ensure_ascii=False, indent=2)
        f.write(';\n')
    print(f'Wrote {out_path}')


if __name__ == '__main__':
    main()
