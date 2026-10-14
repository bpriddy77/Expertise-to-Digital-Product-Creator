"""
Browser test of the access code.
Run a preview with a code:  ACCESS_CODE=pig-test-42 PORT=8791 npm run dev
Then:                       python3 test/access-e2e.py [http://localhost:8791] [code]
"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8791'
CODE = sys.argv[2] if len(sys.argv) > 2 else 'pig-test-42'

async def main():
    fails, errors = [], []
    def check(cond, msg):
        print(('PASS ' if cond else 'FAIL ') + msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(BASE); await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_timeout(700)
        check(await pg.is_visible('#accessCode'), 'access code field shown')

        await pg.click('[data-act=start]'); await pg.wait_for_timeout(300)
        check('Enter your access code' in await pg.inner_text('.error'), 'blank code is stopped')

        await pg.fill('#accessCode', 'anything-at-all'); await pg.click('[data-act=start]'); await pg.wait_for_timeout(500)
        check("doesn't match" in await pg.inner_text('.error'), 'wrong code is stopped with a clear message')
        check(await pg.is_visible('#accessCode') and 'Question 1' not in await pg.inner_text('#view'), 'wrong code stays on the welcome screen')
        check(await pg.evaluate("localStorage.getItem('pig-dp001-access')") is None, 'wrong code is not saved')

        await pg.fill('#accessCode', f'  {CODE} '); await pg.press('#accessCode', 'Enter'); await pg.wait_for_timeout(600)
        check('Question 1 of 5' in await pg.inner_text('#view'), 'right code (with stray spaces, Enter key) gets in')

        await pg.reload(); await pg.wait_for_timeout(600)
        await pg.fill('[data-bind="answers.q1.answer"]', 'People ask me to help them plan meals for picky kids every week.')
        await pg.click('[data-act=nextQ]'); await pg.wait_for_timeout(600)
        check(not await pg.is_visible('.error'), 'saved code keeps working for AI requests after a reload')

        # Code changed on the server mid-project: tamper with the saved code to simulate it
        await pg.evaluate("localStorage.setItem('pig-dp001-access', 'old-code')")
        check('Question 2 of 5' in await pg.inner_text('#view'), 'on question 2')
        await pg.fill('[data-bind="answers.q2.answer"]', 'I cut our grocery bill by a third with a weekly menu.')
        await pg.click('[data-act=nextQ]'); await pg.wait_for_timeout(700)
        check(await pg.is_visible('#accessCode'), 'a code that stops working returns to the welcome screen')
        saved = await pg.evaluate("JSON.parse(localStorage.getItem('pig-dp001-project')).answers.q1.answer")
        check(saved.startswith('People ask me'), 'progress is kept when re-entering the code')

        check(not errors, 'no page errors ' + (str(errors) if errors else ''))
        await b.close()
    print(f"\n{'All checks passed' if not fails else f'{len(fails)} check(s) failed'}")
    sys.exit(1 if fails else 0)

asyncio.run(main())
