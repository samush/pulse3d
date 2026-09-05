#!/usr/bin/env python3
"""Работа с данными сцены (const PLAN в plan.js).

Команды:
  areas                        — таблица: площадь по полигону / записанная / габариты
  check                        — согласованность плана: полигоны, ячейки, окна, двери,
                                 проёмы и санузлы лежат на гранях стен; код 1 при проблемах
  remap AXIS OLD NEW LO HI     — сдвинуть грань стены: все точки с координатой
                                 AXIS(x|z)==OLD, у которых перпендикулярная
                                 координата в [LO,HI], получают значение NEW.
                                 Двигает polys комнат, стены (slabs/slabsR), контур
                                 outer, края ячеек cells, окна, двери, проёмы и
                                 контуры санузлов. Перед записью проверяет план
                                 (check) и пишет файл атомарно; при ошибке ничего
                                 не меняет. Начало координат meta.origin не трогает.
  selftest                     — проверки remap на временной копии плана

Опция --plan PATH перед командой — работать с другим файлом (для проверок).

Грани комнат, стен и ячеек совпадают по координатам, поэтому стены двигаются
ТОЛЬКО этой командой (или таким же скриптом) — руками правки рассыпаются.
Подробнее: docs/GEOMETRY.md.
"""
import json, os, shutil, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN_JS = os.path.join(ROOT, 'plan.js')
TOL = 1e-6
CELL_TOL = 0.05   # края ячеек в данных неточные
AREA_TOL = 0.06   # размеры БТИ округлены до см — расхождение ±0.05 м² это шум
WALL_TOL = 0.45   # дверь/окно считаются «на стене», если их ось в этой полосе от грани
BIND_TOL = 0.2    # двери, санузлы и проёмы заданы по оси/с отступом от грани: тянутся за гранью в этой полосе


def load(path=PLAN_JS):
    s = open(path, encoding='utf-8').read()
    a, b = s.index('{'), s.rindex('}')
    return json.loads(s[a:b + 1])


def save(plan, path=PLAN_JS):
    blob = 'const PLAN=' + json.dumps(plan, ensure_ascii=False, separators=(',', ':')) + ';\n'
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix='.plan.', suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(blob)
    os.replace(tmp, path)


def shoelace(p):
    a = 0
    for i in range(len(p)):
        x1, y1 = p[i]
        x2, y2 = p[(i + 1) % len(p)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def all_polys(plan):
    for r in plan['rooms']:
        yield f"room{r['id']}", r['poly']
    yield 'outer', plan['outer']
    for name in ('slabs', 'slabsR'):
        for band in plan[name]:
            for p in band['polys']:
                yield name, p['s']
                for h in p.get('h', []):
                    yield name + '-hole', h


def wall_lines(plan):
    """Все осепараллельные рёбра полигонов комнат: ('x'|'z', fixed, lo, hi)."""
    for r in plan['rooms']:
        p = r['poly']
        for i in range(len(p)):
            (x1, z1), (x2, z2) = p[i], p[(i + 1) % len(p)]
            if abs(x1 - x2) < TOL:
                yield 'x', x1, min(z1, z2), max(z1, z2)
            elif abs(z1 - z2) < TOL:
                yield 'z', z1, min(x1, x2), max(x1, x2)


def on_wall(plan, axis, fixed, lo, hi):
    """Есть ли грань комнаты по оси axis в полосе WALL_TOL от fixed, перекрывающая [lo,hi]."""
    for ax, f, a, b in wall_lines(plan):
        if ax == axis and abs(f - fixed) <= WALL_TOL and a < hi and b > lo:
            return True
    return False


def cmd_areas(plan):
    print(' id  polygon stored  bbox')
    for r in plan['rooms']:
        p = r['poly']
        xs = [q[0] for q in p]
        zs = [q[1] for q in p]
        a = shoelace(p)
        mark = '' if abs(a - r['area']) < AREA_TOL else '  <-- расходится!'
        print(f" {r['id']:3} {a:7.3f} {r['area']:6} {max(xs)-min(xs):.3f} x {max(zs)-min(zs):.3f}{mark}")


def problems(plan):
    """Список нарушений согласованности плана; пустой список — всё в порядке."""
    out = []
    for tag, poly in all_polys(plan):
        if len(poly) < 3:
            out.append(f'{tag}: меньше 3 точек')
            continue
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            if abs(a[0] - b[0]) < TOL and abs(a[1] - b[1]) < TOL:
                out.append(f'{tag}: повторяющаяся точка {a}')
            elif abs(a[0] - b[0]) >= TOL and abs(a[1] - b[1]) >= TOL and tag.startswith('room'):
                out.append(f'{tag}: косое ребро {a}-{b}')
        if shoelace(poly) < 0.05:
            out.append(f'{tag}: нулевая площадь')
    for r in plan['rooms']:
        if abs(shoelace(r['poly']) - r['area']) >= AREA_TOL:
            out.append(f"room{r['id']}: площадь {shoelace(r['poly']):.3f} против {r['area']} в БТИ")
        xs = [q[0] for q in r['poly']]
        zs = [q[1] for q in r['poly']]
        for c in r['cells']:
            x, z, w, h, k = c
            if w <= 0 or h <= 0:
                out.append(f"room{r['id']}: ячейка {c} с нулевой стороной")
            if x < min(xs) - CELL_TOL or x + w > max(xs) + CELL_TOL or z < min(zs) - CELL_TOL or z + h > max(zs) + CELL_TOL:
                out.append(f"room{r['id']}: ячейка {c} выходит за габарит комнаты")
    for w in plan.get('windows', []):
        if w['z1'] <= w['z0'] or w['y1'] <= w['y0']:
            out.append(f'окно {w}: вырожденный размер')
        if not on_wall(plan, 'x', w['x'], w['z0'], w['z1']):
            out.append(f"окно x={w['x']} z={w['z0']}..{w['z1']}: рядом нет стены комнаты")
    for d in plan.get('doors', []):
        cx, cz, o, wd = d[:4]
        if wd <= 0:
            out.append(f'дверь {d}: нулевая ширина')
        ok = on_wall(plan, 'z', cz, cx - wd / 2, cx + wd / 2) if o == 'h' else on_wall(plan, 'x', cx, cz - wd / 2, cz + wd / 2)
        if not ok:
            out.append(f'дверь {d}: рядом нет стены комнаты')
    for o in plan.get('openings', []):
        if o['x1'] <= o['x0'] or o['z1'] <= o['z0'] or o['h'] <= 0:
            out.append(f'проём {o}: вырожденный размер')
    for b in plan.get('baths', []):
        if not (b['x0'] < b['x1'] and b['z0'] < b['dz0'] < b['dz1'] < b['z1']):
            out.append(f'санузел {b}: дверь вне контура или контур вырожден')
    return out


def cmd_check(plan):
    ps = problems(plan)
    for p in ps:
        print('  ' + p)
    print('план согласован' if not ps else f'проблем: {len(ps)}')
    return 0 if not ps else 1


def remap_data(plan, axis, old, new, lo, hi):
    """Сдвиг грани во всех зависимых данных; возвращает число изменённых значений."""
    ax = 0 if axis == 'x' else 1
    n = 0

    def hit(v, other, tol=TOL):
        return abs(v - old) < tol and lo <= other <= hi

    for tag, poly in all_polys(plan):
        for pt in poly:
            if hit(pt[ax], pt[1 - ax]):
                pt[ax] = round(new, 3)
                n += 1
    for r in plan['rooms']:
        for c in r['cells']:
            x, z, w, h, k = c
            p0, span0, p1, span1 = (x, w, z, h) if ax == 0 else (z, h, x, w)
            if not (p1 < hi and p1 + span1 > lo):
                continue
            if abs(p0 - old) < CELL_TOL:
                span0 += p0 - new
                p0 = new
            elif abs(p0 + span0 - old) < CELL_TOL:
                span0 = new - p0
            else:
                continue
            vals = (p0, z, span0, h) if ax == 0 else (x, p0, w, span0)
            c[0], c[1], c[2], c[3] = (round(v, 3) for v in vals)
            n += 1
    # окна: x — плоскость стены, z0/z1 — края проёма
    for w in plan.get('windows', []):
        if ax == 0 and abs(w['x'] - old) < TOL and w['z0'] < hi and w['z1'] > lo:
            w['x'] = round(new, 3); n += 1
        if ax == 1:
            for key in ('z0', 'z1'):
                if hit(w[key], w['x']):
                    w[key] = round(new, 3); n += 1
    # двери: [cx,cz,o,w] — ось двери лежит на стене; двигается координата, перпендикулярная стене
    for d in plan.get('doors', []):
        cx, cz, o = d[0], d[1], d[2]
        if ax == 0 and o == 'v' and hit(cx, cz, BIND_TOL):
            d[0] = round(cx + (new - old), 3); n += 1
        if ax == 1 and o == 'h' and hit(cz, cx, BIND_TOL):
            d[1] = round(cz + (new - old), 3); n += 1
    # прямоугольные проёмы и контуры санузлов: любая грань с координатой old
    for o in plan.get('openings', []) + plan.get('baths', []):
        keys = ('x0', 'x1') if ax == 0 else ('z0', 'z1', 'dz0', 'dz1')
        other = ((o['z0'] + o['z1']) / 2) if ax == 0 else ((o['x0'] + o['x1']) / 2)
        for key in keys:
            if key in o and hit(o[key], other, BIND_TOL):
                o[key] = round(o[key] + (new - old), 3); n += 1
    return n


def cmd_remap(plan, axis, old, new, lo, hi, path=PLAN_JS):
    if axis not in ('x', 'z'):
        print('AXIS должна быть x или z'); return 1
    if lo > hi:
        print('LO больше HI'); return 1
    xs = [p[0] for p in plan['outer']]; zs = [p[1] for p in plan['outer']]
    rng = (min(xs) - 1, max(xs) + 1) if axis == 'x' else (min(zs) - 1, max(zs) + 1)
    if not (rng[0] <= new <= rng[1]):
        print(f'NEW={new} вне контура квартиры {rng}'); return 1
    n = remap_data(plan, axis, old, new, lo, hi)
    print(f'изменено точек/краёв/привязок: {n}')
    if not n:
        print('ничего не найдено — файл не тронут'); return 1
    ps = problems(plan)
    if ps:
        print('ОТКАЗ: после сдвига план несогласован, файл не записан:')
        for p in ps:
            print('  ' + p)
        return 1
    save(plan, path)
    cmd_areas(plan)
    return 0


def cmd_selftest():
    """Проверки на временной копии: окно и отделка двигаются вместе со стеной, плохой remap не пишет файл."""
    tmpdir = tempfile.mkdtemp(prefix='pulse3d-plan-')
    tmp = os.path.join(tmpdir, 'plan.js')
    shutil.copy(PLAN_JS, tmp)
    fails = []
    try:
        plan = load(tmp)
        before = json.dumps(plan, sort_keys=True)
        w = plan['windows'][0]                      # окно комнаты 1 на западной стене x=0.65
        z0, wx = w['z0'], w['x']
        # 1) сдвиг края оконного проёма (z0) на 5 см: окно, полигон комнаты и ячейки не рвутся
        n = remap_data(plan, 'z', z0, z0 + 0.05, wx - 0.5, wx + 0.5)
        if not (n >= 1 and abs(plan['windows'][0]['z0'] - (z0 + 0.05)) < TOL):
            fails.append('край окна не сдвинулся вместе с гранью')
        # 2) сдвиг плоскости западной стены комнаты 1 (x=0.896) на 2 см двигает окно по x и не трогает другие комнаты
        plan = load(tmp)
        others = {r['id']: json.dumps(r['poly']) for r in plan['rooms'] if r['id'] != 1}
        n = remap_data(plan, 'x', 0.896, 0.916, 1.5, 5.0)
        r1 = next(r for r in plan['rooms'] if r['id'] == 1)
        if not any(abs(p[0] - 0.916) < TOL for p in r1['poly']):
            fails.append('стена комнаты 1 не сдвинулась')
        if any(json.dumps(r['poly']) != others[r['id']] for r in plan['rooms'] if r['id'] != 1):
            fails.append('сдвиг стены комнаты 1 затронул другие комнаты')
        # 3) сдвиг стены с дверью двигает дверь (западная стена комнаты 2, x=11.067, дверь 'v')
        plan = load(tmp)
        n = remap_data(plan, 'x', 11.067, 11.1, 6.0, 10.0)   # дверь [10.99,7.20] на оси стены — тянется на те же 0.033
        if not any(abs(d[0] - (10.99 + 0.033)) < TOL for d in plan['doors'] if d[2] == 'v'):
            fails.append('дверь не сдвинулась вместе со стеной')
        # 4) плохой remap: NEW вне квартиры — файл не меняется
        plan = load(tmp)
        rc = cmd_remap(plan, 'x', 0.896, 99.0, 1.5, 5.0, path=tmp)
        if rc == 0 or json.dumps(load(tmp), sort_keys=True) != before:
            fails.append('некорректный remap записал файл')
        # 5) remap, ломающий согласованность (окно остаётся без стены) — файл не меняется
        plan = load(tmp)
        rc = cmd_remap(plan, 'x', 0.896, 1.5, 1.5, 5.0, path=tmp)
        if rc == 0 or json.dumps(load(tmp), sort_keys=True) != before:
            fails.append('remap с несогласованным результатом записал файл')
        # 6) корректный remap на копии проходит и не трогает рабочий plan.js
        plan = load(tmp)
        work_before = open(PLAN_JS, encoding='utf-8').read()
        rc = cmd_remap(plan, 'x', 0.896, 0.9, 1.5, 5.0, path=tmp)
        if rc != 0:
            fails.append('корректный remap на копии отказал')
        if open(PLAN_JS, encoding='utf-8').read() != work_before:
            fails.append('selftest изменил рабочий plan.js')
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    for f in fails:
        print('  ПРОВАЛ: ' + f)
    print('selftest: ок' if not fails else f'selftest: провалов {len(fails)}')
    return 0 if not fails else 1


def main():
    args = sys.argv[1:]
    path = PLAN_JS
    if args[:1] == ['--plan'] and len(args) >= 2:
        path = args[1]; args = args[2:]
    if not args or args[0] == 'areas':
        cmd_areas(load(path))
    elif args[0] == 'check':
        sys.exit(cmd_check(load(path)))
    elif args[0] == 'remap' and len(args) == 6:
        sys.exit(cmd_remap(load(path), args[1], *map(float, args[2:6]), path=path))
    elif args[0] == 'selftest':
        sys.exit(cmd_selftest())
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
