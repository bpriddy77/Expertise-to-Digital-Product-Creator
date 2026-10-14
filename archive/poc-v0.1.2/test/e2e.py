"""
End-to-end browser test of the whole journey in test mode.

Setup once:  pip install playwright && playwright install chromium
Run:         npm run dev            (separate terminal, test mode)
             python3 test/e2e.py [http://localhost:8790] [screenshot-folder]
"""
import asyncio, sys, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8790'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None

LONG = {
    'q2': 'I got our family grocery bill down by about a third by planning a weekly menu and one shopping list every Sunday.',
    'q3': 'Batch cooking on Sunday saves me hours, but only if I plan around what is on sale that week at the store.',
    'q4': 'Organizing my pantry, trying new recipes, and making checklists for everything in the house, honestly.',
    'q5': 'Twelve years as a school cafeteria manager, and I raised three kids on a tight budget while working full time.',
}

async def main():
    fails, errors = [], []
    def check(cond, msg):
        print(('PASS ' if cond else 'FAIL ') + msg)
        if not cond: fails.append(msg)

    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 1000}, accept_downloads=True)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'TUNNEL' not in m.text and 'fonts' not in m.text else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        txt = lambda s: pg.inner_text(s)
        async def shot(name, full=True):
            if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, f'{name}.png'), full_page=full)

        await pg.goto(f'{BASE}/?debug=1'); await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_timeout(700)
        check('Test mode' in await txt('#banner'), 'test-mode banner shown')
        await shot('01-welcome')
        await pg.click('[data-act=start]'); await pg.wait_for_timeout(300)

        # Q1: vague answer gets a follow-up
        await pg.fill('[data-bind="answers.q1.answer"]', 'Meals.')
        await pg.click('[data-act=nextQ]'); await pg.wait_for_timeout(500)
        check(await pg.is_visible('.followup'), 'vague answer gets one follow-up question')
        await pg.fill('[data-bind="answers.q1.followUpAnswer"]', 'My sister and two friends asked me to help them plan meals for picky kids.')
        await shot('02-followup', False)
        await pg.click('[data-act=nextQ]'); await pg.wait_for_timeout(400)
        check('Question 2 of 5' in await txt('.q-count'), 'moves to question 2')

        # Empty answer is caught
        await pg.click('[data-act=nextQ]'); await pg.wait_for_timeout(200)
        check(await pg.is_visible('.error'), 'empty answer is caught with a friendly message')

        for qid, ans in LONG.items():
            await pg.fill(f'[data-bind="answers.{qid}.answer"]', ans)
            await pg.click('[data-act=nextQ]'); await pg.wait_for_timeout(450)
        check('Here\'s what you shared' in await txt('#view'), 'answers review screen')

        # Strengths
        await pg.click('[data-go=strengths]'); await pg.wait_for_timeout(700)
        cards = await pg.locator('.choice').count()
        check(cards == 3, f'three strength suggestions ({cards})')
        quotes = await pg.locator('.quotes li').all_inner_texts()
        check(len(quotes) > 0 and all(len(q) > 3 for q in quotes), 'each suggestion shows quotes from the answers')
        await shot('03-strengths')
        await pg.click('[data-reject="Running large-scale food service"]'); await pg.wait_for_timeout(200)
        await pg.fill('[data-reject-reason="Running large-scale food service"]', 'I am done with cafeterias')
        check(await pg.locator('.choice.rejected').count() == 1, 'a suggestion can be rejected')
        await pg.click('[data-pick="0"]'); await pg.wait_for_timeout(200)
        await pg.fill('#corr', 'Planning family meals on a budget, more than cooking itself.')
        await pg.click('[data-act=confirmStrength]'); await pg.wait_for_timeout(400)
        check('How do you want your business to feel' in await txt('#view'), 'strength confirmed, on to preferences')

        # Preferences
        for v in ['Writing', 'Organizing and systems']: await pg.click(f'[data-chip=enjoy][data-v="{v}"]')
        for v in ['Live calls', 'Being on camera']: await pg.click(f'[data-chip=avoid][data-v="{v}"]')
        await pg.click('[data-chip=hours][data-v="2–5 hours"]')
        await pg.click('[data-chip=involvement][data-v="Hands-off: sell it and let it run"]')
        check(await pg.locator('.chip[aria-pressed=true]').count() == 6, 'preference chips toggle')
        await shot('04-preferences')
        await pg.click('[data-go=ideas]'); await pg.wait_for_timeout(700)

        # Ideas
        check(await pg.locator('.choice').count() == 3, 'three workbook ideas')
        await pg.click('[data-idea="0"]'); await pg.wait_for_timeout(300)
        await pg.fill('#it', 'The Sunday Meal Plan Workbook')
        await shot('05-ideas')
        await pg.click('[data-go=validate]'); await pg.wait_for_timeout(300)

        # Market check
        check(await txt('#evLabel') == 'Not checked yet', 'evidence starts at "Not checked yet"')
        check(await txt('#pxVal') == '$17', 'test price shown before comparables')
        for n, (name, price) in enumerate([('Meal Planner Printable', '20'), ('Family Menu Workbook', '30'), ('Budget Meals Guide', '25')]):
            await pg.fill(f'#cn{n}', name); await pg.fill(f'#cp{n}', price)
        await pg.wait_for_timeout(200)
        check(await txt('#evLabel') == 'Similar products found', 'evidence level updates live')
        check(await txt('#pxVal') == '$17' and '$25' in await txt('#pxNote'), 'price suggestion from comparables (median $25)')
        await pg.fill('#vq0', 'How do I meal plan for picky kids?')
        await pg.fill('#s1', '3')
        await pg.wait_for_timeout(200)
        check(await txt('#evLabel') == 'Interest shown', 'interest signal raises the level, never "validated"')
        await shot('06-market')
        await pg.click('[data-go=build]'); await pg.wait_for_timeout(700)

        # Build
        check(await pg.locator('.outline-list li').count() == 6, 'outline with 6 sections')
        await pg.click('[data-act=writeAll]'); await pg.wait_for_timeout(2500)
        written = await pg.locator('.sec-body').count()
        check(written == 6, f'all sections written ({written})')
        first = pg.locator('#sec-s1 .sec-body [contenteditable]').first
        await first.click(); await pg.keyboard.press('End'); await pg.keyboard.type(' Edited by hand.')
        await pg.wait_for_timeout(500)
        stored = await pg.evaluate("JSON.parse(localStorage.getItem('pig-dp001-project')).sections.s1.blocks[0].text")
        check(stored.endswith('Edited by hand.'), 'hand edits are saved')
        await pg.fill('#ins-s2', 'make it shorter')
        await pg.click('[data-rewrite=s2]'); await pg.wait_for_timeout(700)
        check('Updated: make it shorter' in await txt('#sec-s2'), 'one section rewrites with the instruction')
        check(await pg.is_visible('[data-undo=s2]'), 'undo is offered after a rewrite')
        await pg.click('[data-undo=s2]'); await pg.wait_for_timeout(300)
        check('Updated:' not in await txt('#sec-s2'), 'undo restores the previous version')
        await shot('07-build')
        await pg.click('[data-go=review]'); await pg.wait_for_timeout(800)

        # Review
        check(await pg.input_value('#pt') != '', 'product title generated')
        await pg.fill('#sl', 'Build passive income with this workbook.')
        await pg.wait_for_timeout(200)
        check('passive income' in await txt('#riskyWarn'), 'income-claim wording is flagged')
        await pg.fill('#sl', 'A guided workbook for busy parents.')
        await pg.wait_for_timeout(200)
        check(await txt('#riskyWarn') == '', 'warning clears')
        await pg.fill('#au', 'Jordan Lee')
        await shot('08-review')

        for kind in ['workbook', 'summary']:
            async with pg.expect_download() as dl:
                await pg.click(f'[data-export={kind}]')
            d = await dl.value
            path = await d.path()
            data = open(path, 'rb').read()
            check(data[:2] == b'PK' and len(data) > 4000, f'{kind} downloads as a Word file ({d.suggested_filename})')
            if SHOTS: await d.save_as(os.path.join(SHOTS, d.suggested_filename))

        await pg.emulate_media(media='print'); await pg.wait_for_timeout(300)
        check(await pg.is_visible('#printDoc') and 'Jordan Lee' in await txt('#printDoc'), 'print layout shows the workbook with the author')
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, '09-print.png'), full_page=True)
        await pg.emulate_media(media='screen')

        check('Total: $' in await txt('#meter'), 'cost meter visible with ?debug=1')
        cost = await pg.evaluate("JSON.parse(localStorage.getItem('pig-dp001-project')).usage.cost")
        calls = await pg.evaluate("JSON.parse(localStorage.getItem('pig-dp001-project')).usage.log.length")
        print(f'INFO estimated AI cost for this run: ${cost:.4f} across {calls} calls')

        # Resume after reload
        await pg.reload(); await pg.wait_for_timeout(700)
        check('Your product is ready to test' in await txt('#view'), 'reload resumes at the last step')
        check(await pg.input_value('#au') == 'Jordan Lee', 'everything typed is still there')
        await pg.click('[data-go=welcome]'); await pg.wait_for_timeout(300)
        check('Pick up where you left off' in await txt('#view'), 'welcome screen offers Continue and Start over')
        await pg.click('[data-act=start]'); await pg.wait_for_timeout(400)
        check('Your product is ready to test' in await txt('#view'), 'Continue returns to the last step')

        # Phone layout
        m = await ctx.new_page(); await m.set_viewport_size({'width': 390, 'height': 844})
        await m.goto(f'{BASE}/'); await m.evaluate('localStorage.clear()'); await m.reload(); await m.wait_for_timeout(700)
        overflow = await m.evaluate('document.documentElement.scrollWidth > window.innerWidth')
        check(not overflow, 'no sideways scrolling on a phone')
        await m.click('[data-act=start]'); await m.wait_for_timeout(500)
        check(not await m.evaluate('document.documentElement.scrollWidth > window.innerWidth'), 'interview fits a phone screen')
        if SHOTS: await m.screenshot(path=os.path.join(SHOTS, '10-phone.png'), full_page=True)

        check(not errors, 'no page errors ' + (str(errors) if errors else ''))
        await b.close()
    print(f"\n{'All checks passed' if not fails else f'{len(fails)} check(s) failed'}")
    sys.exit(1 if fails else 0)

asyncio.run(main())
