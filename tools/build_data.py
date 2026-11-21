import argparse
import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, 'tools', 'cache')
DATA_PATH = os.path.join(BASE_DIR, 'app', 'data.js')
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
    'META': 'その他・コラボ',
    'テンペスタ': 'その他・コラボ',
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
    '工作艦': '工作',
    '運送': '輸送',
    '輸送': '輸送',
    '運送艦': '輸送',
    '補給': '補給',
    '砲艦': '砲艦',
    '重砲': '砲艦',
    'モニター': '砲艦',
    '風帆': '風帆',
    '風帆S': '風帆',
    '風帆V': '風帆',
    '風帆M': '風帆',
}

VALID_FANDOM_RARITIES = {'Normal', 'Rare', 'Elite', 'Super Rare', 'Priority', 'Decisive', 'Ultra Rare'}


def fetch_cached(url, sleep_sec=0.12, retries=2):
    key = hashlib.sha256(url.encode('utf-8')).hexdigest()[:20]
    cache_path = os.path.join(CACHE_DIR, f'{key}.html')
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return f.read()
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            with urllib.request.urlopen(req, timeout=25) as r:
                content = r.read().decode('utf-8', 'ignore')
            with open(cache_path, 'w', encoding='utf-8') as f:
                f.write(content)
            if sleep_sec > 0:
                time.sleep(sleep_sec)
            return content
        except Exception as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    raise last_err


def get_fandom_map():
    url = 'https://blhx.fandom.com/api.php?action=parse&page=Full_Ship_List&prop=text&format=json'
    raw = fetch_cached(url, sleep_sec=0.05)
    data = json.loads(raw)
    html = data['parse']['text']['*']
    soup = BeautifulSoup(html, 'html.parser')
    fmap = {}
    for tr in soup.find_all('tr'):
        tds = [td.get_text(' ', strip=True) for td in tr.find_all(['td', 'th'])]
        if len(tds) >= 7 and tds[1] and tds[3] and tds[6] in VALID_FANDOM_RARITIES:
            no = tds[1].strip()
            name_en = tds[3].strip()
            ship_class = tds[4].strip()
            fmap[name_en.lower()] = {
                'no': no,
                'nameEn': name_en,
                'classEn': ship_class,
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
    s = raw_name.strip()
    if s.startswith(jp_name):
        s = s[len(jp_name):].strip()
    s = re.sub(r'^(USS|HMS|IJN|KMS|SN|ROC|RN|FFNF|MNF|UNIV|MOT|HNLMS|META)\s+', '', s).strip()
    return s


def is_valid_chara_img(src, alt, allow_profile_fallback=False):
    if not src or 'attach2/' not in src:
        return False
    low = src.lower()
    allowed_exts = ('.jpg', '.jpeg', '.png', '.webp') if allow_profile_fallback else ('.jpg', '.jpeg', '.png')
    if not low.endswith(allowed_exts):
        return False
    fname = src.split('/')[-1]
    if fname.startswith('696D67_') and not allow_profile_fallback:
        return False
    base_alt = re.sub(r'\.(jpg|jpeg|png|webp)$', '', alt.strip(), flags=re.IGNORECASE)
    if '_SD' in alt or '_sd' in alt.lower() or base_alt.endswith('SD') or 'icon' in alt.lower():
        return False
    if low.endswith('.webp') and ('fps' in alt.lower() or 'live2d' in alt.lower()):
        return False
    if re.search(r'\(T[0-3]\)|^e\d+_\d+|^\d{3}-\d+', alt.strip(), re.IGNORECASE):
        return False
    return True


def clean_skin_label(raw_label, jp_name, has_default):
    label = re.sub(r'\.(jpg|jpeg|png|webp)$', '', raw_label, flags=re.IGNORECASE).strip()
    if not label or label == jp_name or label == f'{jp_name}_2':
        return '通常' if not has_default else '別立ち絵'
    if ')' in label and '(' not in label and '（' not in label:
        label = label.replace(')', '')
    return label


def extract_auto_tags(jp_name, faction, images, skin_text, chara_text, has_oath, has_live2d):
    tags = []
    def add(t):
        if t not in tags:
            tags.append(t)

    # 1. Mechanical tags
    if faction == 'その他・コラボ':
        add('コラボ艦')
    if len(images) >= 6:
        add('着せ替え多数')
    if has_live2d:
        add('Live2D着せ替えあり')

    # 2. Skin type tags from image labels and skin section text
    lbls = ' '.join(i['label'] for i in images)
    skin_all = f'{lbls} {skin_text}'
    if re.search(r'水着|ビキニ|競泳|海水浴|ビーチ', skin_all):
        add('水着')
    if re.search(r'メイド', skin_all):
        add('メイド')
    if re.search(r'バニー', skin_all):
        add('バニー')
    if re.search(r'ドレス|パーティー|イブニング|舞踏会', skin_all):
        add('ドレス')
    if re.search(r'チャイナ|春節|旗袍', skin_all):
        add('チャイナ')
    if re.search(r'パジャマ|寝間着|ナイトウェア', skin_all):
        add('パジャマ')
    if re.search(r'制服|学園|スクール|セーラー服', skin_all):
        add('制服')
    if re.search(r'修道女|シスター', skin_all):
        add('修道女')
    if re.search(r'巫女', skin_all):
        add('巫女')
    if has_oath or re.search(r'ウェディング|花嫁|白無垢|ケッコン衣装', skin_all):
        add('ウェディング')
    if re.search(r'着物|振袖|浴衣|正月|晴れ着', skin_all):
        add('着物')
    if 'μ兵装' in jp_name or re.search(r'アイドル|ステージ|ライブ', skin_all):
        add('アイドル')
    if re.search(r'レースクイーン|体操服|スポーツ|テニス|フィットネス|運動', skin_all):
        add('スポーツ')
    if re.search(r'ナース|白衣|看護師|検診', skin_all):
        add('ナース')

    # 3. Character description text (strictly evidence-based)
    if chara_text:
        for kw, tag in [
            ('クール', 'クール'),
            ('元気', '元気'),
            ('甘え', '甘えんぼ'),
            ('お姉さん', 'お姉さん系'),
            ('姉御', 'お姉さん系'),
            ('凛々し', '凛々しい'),
            ('ふんわり', 'ふんわり'),
            ('勝ち気', '勝ち気'),
            ('ミステリアス', 'ミステリアス'),
            ('妖し', '妖しい'),
            ('妖艶', '妖しい'),
            ('清楚', '清楚'),
            ('ツンデレ', 'ツンデレ'),
            ('お嬢様', 'お嬢様'),
            ('真面目', '真面目'),
            ('眼鏡', '眼鏡'),
            ('メガネ', '眼鏡'),
            ('眼帯', '眼帯'),
            ('軍服', '軍服'),
            ('狐耳', '狐耳'),
            ('キツネ耳', '狐耳'),
            ('猫耳', '猫耳'),
            ('ネコ耳', '猫耳'),
            ('兎耳', '兎耳'),
            ('ウサ耳', '兎耳'),
            ('うさ耳', '兎耳'),
            ('和風', '和風'),
            ('中華風', '中華風'),
            ('ゴシック', 'ゴシック'),
            ('騎士', '騎士風'),
            ('長髪', '長髪'),
            ('ロングヘア', '長髪'),
            ('短髪', '短髪'),
            ('ショートヘア', '短髪'),
            ('ツインテール', 'ツインテール'),
            ('ポニーテール', 'ポニーテール'),
            ('銀髪', '銀髪'),
            ('黒髪', '黒髪'),
            ('金髪', '金髪'),
            ('ピンク髪', 'ピンク髪'),
            ('紫髪', '紫髪'),
            ('青髪', '青髪'),
        ]:
            if kw in chara_text:
                add(tag)

    return tags


def parse_ship_page(jp_name, page_url, rarity_raw, type_hint, acq_hint, _depth=0):
    html = fetch_cached(page_url)
    soup = BeautifulSoup(html, 'html.parser')
    for sc in soup.find_all('script'):
        sc.decompose()
    body = soup.find('div', id='body') or soup

    # Check if this is a redirect/disambiguation notice (e.g. 天城 -> 天城(巡戦))
    if _depth == 0:
        has_profile = any(
            (t.find('tr') and t.find('tr').get_text(' ', strip=True) == 'プロフィール')
            for t in body.find_all('table')
        )
        if not has_profile:
            body_txt = body.get_text(' ', strip=True)
            if '変更' in body_txt or '曖昧さ' in body_txt or len(body_txt) < 400:
                for a in body.find_all('a', href=True):
                    atext = a.get_text(' ', strip=True)
                    if jp_name in atext and ('(' in atext or '（' in atext) and '空母' not in atext:
                        return parse_ship_page(jp_name, normalize_url(a['href']), rarity_raw, type_hint, acq_hint, _depth=1)

    profile = {}
    ship_class = ''
    acquisition_parts = []
    skills = []

    for table in body.find_all('table'):
        rows = table.find_all('tr')
        if not rows:
            continue
        first_txt = rows[0].get_text(' ', strip=True)

        if first_txt == 'プロフィール':
            for tr in rows[1:]:
                cells = tr.find_all(['th', 'td'])
                if len(cells) >= 2:
                    texts = [c.get_text(' ', strip=True) for c in cells]
                    for idx in range(len(texts) - 1):
                        k = texts[idx]
                        v = texts[idx + 1]
                        if k in ('名前', 'レアリティ', '艦種', '陣営', 'CV', 'イラスト'):
                            profile[k] = v

        elif first_txt == '入手方法':
            for tr in rows[1:]:
                cells = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
                if len(cells) >= 2:
                    acquisition_parts.append(f'{cells[0]}: {cells[1]}')
                elif cells:
                    acquisition_parts.append(cells[0])

        elif first_txt == '艦船技術':
            for tr in rows[1:]:
                cells = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
                if len(cells) >= 2 and cells[0] == '艦級':
                    cls = re.sub(r'^T\d+\s*', '', cells[1]).strip()
                    ship_class = cls

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

    # 1. Profile default image
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

    # 2. Oath headings
    has_oath = False
    for h in body.find_all(['h2', 'h3']):
        htext = h.get_text(' ', strip=True)
        m_oath = re.search(r'ケッコン後\(([^)]+)\)', htext)
        if m_oath:
            has_oath = True
            oath_name = m_oath.group(1).strip()
            for sib in [h.find_previous_sibling(), h.find_next_sibling()]:
                if sib and hasattr(sib, 'find_all'):
                    for img in sib.find_all('img'):
                        src = img.get('data-src') or img.get('src') or ''
                        alt = img.get('alt') or ''
                        if is_valid_chara_img(src, alt):
                            add_img(f'ケッコン：{oath_name}', src)

    # 3. Skin section & character description
    skin_texts = []
    chara_texts = []
    current_h2 = ''
    in_chara = False
    for el in body.children:
        tag = getattr(el, 'name', None)
        if tag == 'h2':
            current_h2 = el.get_text(' ', strip=True)
            in_chara = False
            continue
        if not hasattr(el, 'find_all'):
            continue
        if '着せ替え' in current_h2:
            skin_texts.append(el.get_text(' ', strip=True))
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

    for el in body.descendants:
        if getattr(el, 'name', None) in ('h2', 'h3'):
            ht = el.get_text(' ', strip=True)
            if 'キャラクター' in ht:
                in_chara = True
                continue
            elif in_chara:
                break
        if in_chara and getattr(el, 'name', None) in ('p', 'li'):
            t = el.get_text(' ', strip=True)
            if t:
                chara_texts.append(t)

    skin_joined = ' '.join(skin_texts)
    chara_joined = ' '.join(chara_texts)
    has_live2d = any('live2d' in img['label'].lower() for img in images) or (
        'live2d' in skin_joined.lower() or 'l2d' in skin_joined.lower()
    )

    raw_name = profile.get('名前', jp_name)
    name_en = parse_name_en(raw_name, jp_name)
    raw_faction = profile.get('陣営', '')
    faction = FACTION_MAP.get(raw_faction, 'その他・コラボ')
    raw_type = profile.get('艦種', type_hint)
    ship_type = TYPE_MAP.get(raw_type, raw_type)

    plan = None
    if rarity_raw == 'DR':
        rarity = 'UR'
        plan = 'DR'
    elif rarity_raw == 'PR':
        rarity = 'SSR'
        plan = 'PR'
    else:
        rarity = rarity_raw if rarity_raw in ('UR', 'SSR', 'SR', 'R', 'N') else 'SR'

    acquisition = ' / '.join(acquisition_parts) if acquisition_parts else acq_hint
    if rarity_raw in ('DR', 'PR') and '開発ドック' not in acquisition:
        acquisition = '開発ドック（科学研究）'

    tags = extract_auto_tags(jp_name, faction, images, skin_joined, chara_joined, has_oath, has_live2d)

    return {
        'jp_name': jp_name,
        'nameEn': name_en,
        'class': ship_class,
        'rarity': rarity,
        'plan': plan,
        'type': ship_type,
        'faction': faction,
        'cv': profile.get('CV', ''),
        'illustrator': profile.get('イラスト', ''),
        'tags': tags,
        'skills': skills[:4],
        'acquisition': acquisition,
        'sourceUrl': page_url,
        'images': images,
    }


def load_locked_ships():
    if not os.path.exists(DATA_PATH):
        return []
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        raw = f.read()
    m = re.search(r'const SHIPS_DATA = (\[.*\]);', raw, re.S)
    if not m:
        return []
    ships = json.loads(m.group(1))
    # Keep existing 47 UR/DR ships untouched
    locked = [s for s in ships if s.get('rarity') == 'UR' or s.get('plan') == 'DR']
    return locked


def collect_all_targets():
    targets_by_url = {}

    # 1. 実装履歴
    hist_url = 'https://azurlane.wikiru.jp/?%E6%96%B0%E3%82%AD%E3%83%A3%E3%83%A9%E3%83%BB%E6%94%B9%E9%80%A0%E3%82%AD%E3%83%A3%E3%83%A9%E3%81%AE%E5%AE%9F%E8%A3%85%E5%B1%A5%E6%AD%B4'
    soup = BeautifulSoup(fetch_cached(hist_url), 'html.parser')
    body = soup.find('div', id='body') or soup
    hist_rows = []
    for tr in body.find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) >= 3:
            texts = [td.get_text(' ', strip=True) for td in tds]
            rar = texts[1]
            name = texts[2]
            if rar in ('UR', 'DR', 'SSR', 'PR', 'SR', 'R', 'N') and not name.endswith('改'):
                a = tds[2].find('a', href=True)
                if a:
                    u = normalize_url(a['href'])
                    acq = texts[-1] if len(texts) > 3 else ''
                    hist_rows.append((name, u, rar, texts[0], acq))
    for item in reversed(hist_rows):
        if item[1] not in targets_by_url:
            targets_by_url[item[1]] = item

    # 2. キャラクターリスト (catches initial launch ships missing from history)
    list_url = 'https://azurlane.wikiru.jp/?%E3%82%AD%E3%83%A3%E3%83%A9%E3%82%AF%E3%82%BF%E3%83%BC%E3%83%AA%E3%82%B9%E3%83%88'
    soup2 = BeautifulSoup(fetch_cached(list_url), 'html.parser')
    body2 = soup2.find('div', id='body') or soup2
    for tr in body2.find_all('tr'):
        tds = tr.find_all('td')
        if len(tds) >= 5:
            texts = [td.get_text(' ', strip=True) for td in tds]
            name = texts[0]
            rar = texts[2]
            ship_type = texts[3]
            acq = texts[4] if len(texts) > 4 else ''
            if rar in ('UR', 'DR', 'SSR', 'PR', 'SR', 'R', 'N') and not name.endswith('改'):
                a = tds[0].find('a', href=True)
                if a:
                    u = normalize_url(a['href'])
                    if u not in targets_by_url:
                        targets_by_url[u] = (name, u, rar, ship_type, acq)

    return list(targets_by_url.values())


def refresh_tags_for_existing():
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        raw = f.read()
    ships = json.loads(re.search(r'const SHIPS_DATA = (\[.*\]);', raw, re.S).group(1))
    NEW_TAGS_ONLY = {'ツンデレ', 'お嬢様', '真面目', '眼鏡', '眼帯', '軍服', '着物', 'アイドル', 'スポーツ', 'ナース'}

    for s in ships:
        url = s['sourceInfo']['url']
        key = hashlib.sha256(url.encode('utf-8')).hexdigest()[:20]
        cpath = os.path.join(CACHE_DIR, f'{key}.html')
        if not os.path.exists(cpath):
            continue
        soup = BeautifulSoup(open(cpath, encoding='utf-8').read(), 'html.parser')
        for sc in soup.find_all('script'):
            sc.decompose()
        body = soup.find('div', id='body') or soup

        skin_texts, chara_texts = [], []
        current_h2 = ''
        has_oath = False
        for el in body.children:
            tag = getattr(el, 'name', None)
            if tag == 'h2':
                current_h2 = el.get_text(' ', strip=True)
            elif tag == 'h3' and 'ケッコン' in el.get_text():
                has_oath = True
            if '着せ替え' in current_h2 and hasattr(el, 'get_text'):
                skin_texts.append(el.get_text(' ', strip=True))
        in_chara = False
        for el in body.descendants:
            if getattr(el, 'name', None) in ('h2', 'h3'):
                ht = el.get_text(' ', strip=True)
                if 'キャラクター' in ht:
                    in_chara = True
                    continue
                elif in_chara:
                    break
            if in_chara and getattr(el, 'name', None) in ('p', 'li'):
                t = el.get_text(' ', strip=True)
                if t:
                    chara_texts.append(t)

        skin_joined = ' '.join(skin_texts)
        chara_joined = ' '.join(chara_texts)
        auto_tags = extract_auto_tags(s['name'], s['faction'], s['images'], skin_joined, chara_joined, has_oath, False)
        existing_tags = list(s.get('tags', []))
        for t in auto_tags:
            if t in NEW_TAGS_ONLY and t not in existing_tags:
                existing_tags.append(t)
        s['tags'] = existing_tags

    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        f.write('// アズールレーン 艦船まとめ表 データベース (Generated by tools/build_data.py)\n')
        f.write(f'// Last updated: {TODAY}\n')
        f.write('const SHIPS_DATA = ')
        json.dump(ships, f, ensure_ascii=False, indent=2)
        f.write(';\n')
    print(f'Refreshed tags for {len(ships)} ships.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--rarities', default='ALL', help='Comma-separated rarities to include (e.g. PR,SSR or ALL)')
    parser.add_argument('--refresh-tags', action='store_true', help='Add newly added tag rules to existing data.js without altering other fields')
    args = parser.parse_args()

    if args.refresh_tags:
        refresh_tags_for_existing()
        return

    if args.rarities.upper() == 'ALL':
        target_rarities = {'UR', 'DR', 'PR', 'SSR', 'SR', 'R', 'N'}
    else:
        target_rarities = {r.strip().upper() for r in args.rarities.split(',') if r.strip()}

    locked_ships = load_locked_ships()
    locked_urls = {s['sourceInfo']['url'] for s in locked_ships}
    used_ids = {s['id'] for s in locked_ships}
    print(f'Locked existing ships: {len(locked_ships)}')

    fandom_map = get_fandom_map()
    all_targets = collect_all_targets()
    print(f'Total unique targets discovered: {len(all_targets)}')

    to_fetch = [
        t for t in all_targets
        if t[1] not in locked_urls and t[2] in target_rarities
    ]
    print(f'New targets to process for {sorted(target_rarities)}: {len(to_fetch)}')

    parsed_results = {}
    failed = []

    def worker(item):
        jp_name, page_url, rar_raw, type_hint, acq_hint = item
        return page_url, rar_raw, parse_ship_page(jp_name, page_url, rar_raw, type_hint, acq_hint)

    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(worker, item): item for item in to_fetch}
        done_cnt = 0
        for fut in as_completed(futs):
            item = futs[fut]
            done_cnt += 1
            if done_cnt % 50 == 0:
                print(f'  Processed {done_cnt}/{len(to_fetch)}...')
            try:
                page_url, rar_raw, data = fut.result()
                parsed_results[page_url] = (rar_raw, data)
            except Exception as e:
                failed.append((item[0], item[1], str(e)))

    if failed:
        print(f'FAILED ({len(failed)}):')
        for fitem in failed[:20]:
            print(' ', fitem)

    seq_counters = {'UR': 100, 'DR': 100, 'PR': 1, 'SSR': 1, 'SR': 1, 'R': 1, 'N': 1}
    new_records = []
    no_img_ships = []

    for jp_name, page_url, rar_raw, type_hint, acq_hint in to_fetch:
        if page_url not in parsed_results:
            continue
        rar_raw, parsed = parsed_results[page_url]
        f_info = fandom_map.get(parsed['nameEn'].lower()) if parsed['nameEn'] else None
        ship_id = None
        if f_info and f_info['no']:
            cand = f"AL-{f_info['no']}"
            if cand not in used_ids:
                ship_id = cand
            if not parsed['class'] and f_info['classEn']:
                parsed['class'] = f_info['classEn']

        if not ship_id:
            while True:
                cand = f"AL-{rar_raw}{seq_counters[rar_raw]:03d}"
                seq_counters[rar_raw] += 1
                if cand not in used_ids:
                    ship_id = cand
                    break
        used_ids.add(ship_id)

        if not parsed['images']:
            no_img_ships.append((ship_id, parsed['jp_name'], page_url))

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
            'tags': parsed['tags'],
            'skills': parsed['skills'],
            'acquisition': parsed['acquisition'],
            'sourceInfo': {
                'url': parsed['sourceUrl'],
                'date': TODAY,
            },
            'images': parsed['images'],
        })
        new_records.append(rec)

    all_records = locked_ships + new_records
    print(f'Total output records: {len(all_records)} (Locked: {len(locked_ships)}, New: {len(new_records)})')
    if no_img_ships:
        print(f'Ships with 0 images ({len(no_img_ships)}): {no_img_ships[:15]}')

    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        f.write('// アズールレーン 艦船まとめ表 データベース (Generated by tools/build_data.py)\n')
        f.write(f'// Last updated: {TODAY}\n')
        f.write('const SHIPS_DATA = ')
        json.dump(all_records, f, ensure_ascii=False, indent=2)
        f.write(';\n')
    print(f'Wrote {DATA_PATH}')


if __name__ == '__main__':
    main()
