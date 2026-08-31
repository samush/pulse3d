#!/usr/bin/env python3
"""Работа с данными сцены (const PLAN в plan.js).

Команды:
  areas                        — таблица: площадь по полигону / записанная / габариты
  remap AXIS OLD NEW LO HI     — сдвинуть грань стены: все точки с координатой
                                 AXIS(x|z)==OLD, у которых перпендикулярная
                                 координата в [LO,HI], получают значение NEW.
                                 Двигает polys комнат, стены (slabs/slabsR),
                                 контур outer и края ячеек cells. Пишет plan.js.

Грани комнат, стен и ячеек совпадают по координатам, поэтому стены двигаются
ТОЛЬКО этой командой (или таким же скриптом) — руками правки рассыпаются.
Подробнее: docs/GEOMETRY.md.
"""
import json, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN_JS = os.path.join(ROOT, 'plan.js')
TOL = 1e-6
CELL_TOL = 0.05  # края ячеек в данных неточные


def load():
    s = open(PLAN_JS, encoding='utf-8').read()
    a, b = s.index('{'), s.rindex('}')
    return json.loads(s[a:b + 1])


def save(plan):
    blob = json.dumps(plan, ensure_ascii=False, separators=(',', ':'))
    open(PLAN_JS, 'w', encoding='utf-8').write('const PLAN=' + blob + ';\n')


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


def cmd_areas(plan):
    print(' id  polygon stored  bbox')
    for r in plan['rooms']:
        p = r['poly']
        xs = [q[0] for q in p]
        zs = [q[1] for q in p]
        a = shoelace(p)
        mark = '' if abs(round(a + 1e-9, 1) - r['area']) < 0.051 else '  <-- расходится!'
        print(f" {r['id']:3} {a:7.3f} {r['area']:6} {max(xs)-min(xs):.3f} x {max(zs)-min(zs):.3f}{mark}")


def cmd_remap(plan, axis, old, new, lo, hi):
    ax = 0 if axis == 'x' else 1
    n = 0
    for tag, poly in all_polys(plan):
        for pt in poly:
            if abs(pt[ax] - old) < TOL and lo <= pt[1 - ax] <= hi:
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
    print(f'изменено точек/краёв ячеек: {n}')
    if n:
        save(plan)
    cmd_areas(plan)


def main():
    plan = load()
    if len(sys.argv) < 2 or sys.argv[1] == 'areas':
        cmd_areas(plan)
    elif sys.argv[1] == 'remap' and len(sys.argv) == 7:
        cmd_remap(plan, sys.argv[2], *map(float, sys.argv[3:7]))
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
