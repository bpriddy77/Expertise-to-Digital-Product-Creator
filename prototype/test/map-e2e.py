"""End-to-end check of the bundled map prototype. Usage: python3 test/map-e2e.py [shots_dir]"""
import pathlib, sys
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
url = (root / 'dist' / 'preview.html').as_uri()
shots = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
results = []
def check(name, cond):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 1000})
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'fonts' not in m.text and errors.append(m.text))
    pg.goto(url); pg.wait_for_timeout(500)

    check('renders 4 lanes', pg.locator('.lane').count() == 4)
    check('renders 8 idea cards', pg.locator('.board .opp').count() == 8)
    check('renders 6 assets and 6 problems', pg.locator('.board .asset').count() == 6 and pg.locator('.board .problem').count() == 6)
    check('renders 2 offers', pg.locator('.offer').count() == 2)
    check('one card marked test first', pg.locator('.opp.first').count() == 1 and 'Content Preparation Kit' in pg.locator('.opp.first h3').inner_text())
    check('connector lines drawn on desktop', pg.locator('svg.links path[data-opp]').count() == 8)
    check('all four roles shown', all(pg.locator(f'.opp .role.{r}').count() for r in ['paid', 'free', 'onboarding', 'included']))
    check('hypothesis/evidence status shown', pg.locator('.opp .status').count() == 8)
    check('funnel shows five products leading to the signature offer', pg.locator('.slot:not(.empty)').count() == 5 and 'Custom Website Build' in pg.locator('.dest').inner_text())
    check('total available offer value shown', '$338' in pg.locator('.aov').inner_text())
    check('recommendation has a first test', 'five' in pg.locator('.rec .step-box').inner_text().lower())
    if shots: pg.screenshot(path=str(shots / 'desktop.png'), full_page=True)

    pg.hover('.opp[data-opp="op1"]'); pg.wait_for_timeout(150)
    check('hover lights sources, offer and line', pg.locator('.lit').count() >= 4 and pg.locator('.offer.lit').count() == 1)
    if shots: pg.screenshot(path=str(shots / 'hover.png'))
    pg.mouse.move(5, 5)

    pg.click('.opp[data-opp="op2"]'); pg.wait_for_timeout(100)
    check('drawer opens', pg.locator('.drawer').count() == 1)
    pg.fill('#f-name', 'Service Story Workbook'); pg.wait_for_timeout(50)
    check('rename updates card live', pg.locator('.opp[data-opp="op2"] h3').inner_text() == 'Service Story Workbook')
    pg.check('.role-pick input[value="free"]'); pg.wait_for_timeout(50)
    check('role change updates card', pg.locator('.opp[data-opp="op2"] .role.free').count() == 1)
    before = pg.locator('.opp[data-opp="op2"] .status').inner_text()
    n = pg.locator('.drawer .toggle').count()
    for i in range(n):
        t = pg.locator('.drawer .toggle').nth(i)
        if t.inner_text().lower().startswith('assum'): t.click(); pg.wait_for_timeout(50)
    after = pg.locator('.opp[data-opp="op2"] .status').inner_text()
    check('evidence toggle changes status', before != after)
    pg.select_option('select[data-conn="o2"]', 'leads'); pg.wait_for_timeout(50)
    check('new connection draws a line', pg.locator('svg.links path[data-opp="op2"]').count() == 2)
    if shots: pg.screenshot(path=str(shots / 'drawer.png'))
    pg.click('[data-act="makeFirst"]'); pg.wait_for_timeout(100)
    check('test-first moves', pg.locator('.opp.first').get_attribute('data-opp') == 'op2')
    check('reasons cleared and prompt shown', 'Add your reasons' in pg.locator('.rec').inner_text())
    pg.click('[data-act="remove"]'); pg.click('[data-act="removeYes"]'); pg.wait_for_timeout(100)
    check('remove hides card', pg.locator('.opp[data-opp="op2"]').count() == 0)
    check('removing first idea picks another', pg.locator('.opp.first').count() == 1)
    pg.click('#toast [data-act="undo"]'); pg.wait_for_timeout(100)
    check('undo restores card and first status', pg.locator('.opp.first').get_attribute('data-opp') == 'op2')

    pg.keyboard.press('Escape')
    pg.reload(); pg.wait_for_timeout(400)
    check('edits persist after reload', pg.locator('.opp[data-opp="op2"] h3').inner_text() == 'Service Story Workbook')

    pg.click('[data-act="add"]'); pg.wait_for_timeout(100)
    check('add idea opens new card', pg.locator('.board .opp').count() == 9 and pg.locator('#f-name').input_value() == 'New product idea')
    pg.keyboard.press('Escape')
    pg.click('[data-act="reset"]'); pg.click('[data-act="reset"]'); pg.wait_for_timeout(150)
    check('reset returns to example', pg.locator('.board .opp').count() == 8 and pg.locator('.opp.first').get_attribute('data-opp') == 'op1')

    # pricing and goal
    check('average per sale estimate shown', '$48' in pg.locator('.aov').inner_text())
    check('goal not met message at $100', 'To average $100' in pg.locator('.goal-msg').inner_text() or 'only with strong' in pg.locator('.goal-msg').inner_text())
    pg.click('[data-goal="50"]'); pg.wait_for_timeout(100)
    check('lower goal shows met scenarios', pg.locator('.est-card.met').count() >= 1)
    pg.click('[data-priceset="premium"]'); pg.wait_for_timeout(150)
    check('price set applies to every product in the funnel', pg.locator('.slot[data-opp="op1"] .slot-price').inner_text() == '$47' and '$568' in pg.locator('.aov').inner_text().replace(',', ''))
    if shots: pg.locator('.pricing').screenshot(path=str(shots / 'pricing.png'))
    pg.click('[data-act="reset"]'); pg.click('[data-act="reset"]'); pg.wait_for_timeout(150)

    # funnel editing
    pg.click('.slot[data-opp="op2"]'); pg.wait_for_timeout(100)
    pg.select_option('#f-slot', ''); pg.wait_for_timeout(100)
    check('taking an idea out empties its position', pg.locator('.slot.empty[data-slot="bump"]').count() == 1 and '$321' in pg.locator('.aov').inner_text())
    pg.keyboard.press('Escape')
    pg.click('.slot.empty[data-slot="bump"]'); pg.wait_for_timeout(100)
    check('empty position offers ideas to place', pg.locator('.pick').count() >= 2)
    pg.click('.pick[data-place="op6"]'); pg.wait_for_timeout(100)
    check('placing a lead magnet makes it a digital product in that position', pg.locator('.slot[data-opp="op6"]').count() == 1 and pg.locator('.opp[data-opp="op6"] .role.paid').count() == 1)
    pg.click('.slot[data-opp="op6"]'); pg.wait_for_timeout(100)
    pg.fill('#f-price', '$9'); pg.wait_for_timeout(100)
    check('price edit updates total value', '$330' in pg.locator('.aov').inner_text())
    pg.select_option('#f-slot', 'main'); pg.wait_for_timeout(150)
    f_main = pg.locator('.fun-col').first.locator('.slot').get_attribute('data-opp')
    check('moving into a taken position swaps the other idea out', f_main == 'op6' and pg.locator('.slot.empty[data-slot="bump"]').count() == 1 and pg.locator('.opp[data-opp="op1"] .slot-chip').count() == 0)
    if shots: pg.screenshot(path=str(shots / 'funnel-edit.png'))
    pg.keyboard.press('Escape')
    pg.click('[data-act="reset"]'); pg.click('[data-act="reset"]'); pg.wait_for_timeout(150)

    for ex, name in [('meal', 'Simmer'), ('quilt', 'Bramble'), ('hr', 'Clearwater')]:
        pg.select_option('#exampleSwitch', ex); pg.wait_for_timeout(250)
        ok = name in pg.locator('.mast h1').inner_text() and pg.locator('.board .opp.first').count() == 1 and pg.locator('svg.links path[data-opp]').count() >= 4 and pg.locator('.slot:not(.empty)').count() >= 3
        check(f'switch to {ex} example renders its map', ok)
        if shots: pg.screenshot(path=str(shots / f'example-{ex}.png'), full_page=True)
    pg.select_option('#exampleSwitch', 'web'); pg.wait_for_timeout(200)
    check('switching back keeps the edited web example', pg.locator('.mast h1').inner_text().find('Northline') >= 0)

    m = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True).new_page()
    m.goto(url); m.wait_for_timeout(500)
    sw = m.evaluate('document.documentElement.scrollWidth')
    check(f'phone: no horizontal scroll ({sw})', sw <= 390)
    check('phone: connectors hidden', m.locator('svg.links path[data-opp]').count() == 0)
    m.tap('.opp[data-opp="op3"]'); m.wait_for_timeout(150)
    check('phone: drawer opens and fits', m.locator('.drawer').bounding_box()['width'] <= 390)
    if shots:
        m.screenshot(path=str(shots / 'phone-drawer.png'))
        m.keyboard.press('Escape'); m.screenshot(path=str(shots / 'phone.png'), full_page=True)

    check('no page errors' + (f': {errors}' if errors else ''), not errors)
    b.close()

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
