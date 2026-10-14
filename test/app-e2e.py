"""
Browser test of the whole customer journey in test mode.
Usage: PORT=8791 node scripts/dev-server.mjs &   then   python3 test/app-e2e.py [shots_dir]
"""
import os, sys, json, pathlib
from playwright.sync_api import sync_playwright

BASE = f"http://localhost:{os.environ.get('PORT', '8791')}"
shots = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
results = []
def check(name, cond):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name)
def shot(page, name, full=False):
    if shots: page.screenshot(path=str(shots / f'app-{name}.png'), full_page=full)

LONG = {
    'q1': 'I design custom websites for coaches and therapists who have outgrown their do-it-yourself site.',
    'q2': 'My signature offer is a custom website build, six weeks, for $3,500.',
    'q4': 'Inquiry, discovery call, proposal, deposit, content questionnaire, design, two revisions, launch and a walkthrough.',
    'q5': 'How to gather their copy and photos, and what a good About page needs to say.',
    'q6': 'They need their service descriptions, photos and logo before design can start.',
    'q7': 'A content questionnaire in Google Docs, a what we need from you email and a photo shot list in Canva.',
    'q8': 'Projects stall two to three weeks waiting on copy and photos from the client.',
    'q10': 'They already know what content their site needs and have it ready.',
    'q11': 'Gathering and writing their content with a good template.',
    'q12': 'Prospects ask whether I have a do-it-yourself version they could use first.',
}

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900})
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'fonts.g' not in m.text and errors.append(m.text))

    # Welcome
    pg.goto(BASE + '/'); pg.wait_for_timeout(400)
    check('welcome shows the promise', 'hiding inside your business' in pg.locator('.hero h1').inner_text())
    shot(pg, 'welcome', True)
    pg.fill('#resendEmail', 'someone@example.com'); pg.click('[data-ui-form="resend"] button'); pg.wait_for_timeout(300)
    check('resend form gives the neutral reply', 'If that email matches a purchase' in pg.locator('#resendMsg').inner_text())
    pg.click('[data-ui="example"]'); pg.wait_for_timeout(400)
    check('example map is read-only', pg.locator('.funnel').count() == 1 and pg.locator('[data-act="add"]').count() == 0)
    pg.click('.slot[data-opp="op1"]'); pg.wait_for_timeout(150)
    check('read-only map does not open the editor', pg.locator('.drawer').count() == 0)
    pg.click('[data-app="back-welcome"]'); pg.wait_for_timeout(200)
    check('back to welcome', pg.locator('.hero').count() == 1)

    # Demo session (stands in for the purchase email link)
    pg.goto(BASE + '/?demo=1'); pg.wait_for_timeout(600)
    check('link removed from the address bar', 'demo' not in pg.url and 't=' not in pg.url)
    check('intro screen', 'Welcome' in pg.locator('.card h2').inner_text())
    pg.click('[data-ui="start"]'); pg.wait_for_timeout(200)
    check('stage 1 of 5 shown', 'Stage 1 of 5' in pg.locator('.qcount').inner_text() and 'Question 1 of 13' in pg.locator('.qcount').inner_text())
    shot(pg, 'question')

    # q1: vague answer -> follow-up
    pg.fill('#answer', 'Websites'); pg.click('[data-ui="next"]'); pg.wait_for_timeout(500)
    check('vague answer gets one follow-up', pg.locator('.followup').count() == 1)
    shot(pg, 'followup')
    pg.fill('#fu', 'Mostly therapists and coaches who need a professional site.'); pg.click('[data-ui="next"]'); pg.wait_for_timeout(500)
    check('moves to question 2 with acknowledgement and tailored examples', 'Question 2 of 13' in pg.locator('.qcount').inner_text() and pg.locator('.ack').count() == 1 and pg.locator('.examples .tailored').count() == 1)

    # empty required answer is not accepted
    pg.fill('#answer', ''); pg.click('[data-ui="next"]'); pg.wait_for_timeout(200)
    check('required question asks for an answer', 'Add a short answer' in pg.locator('.qcard').inner_text())
    pg.fill('#answer', LONG['q2']); pg.click('[data-ui="next"]'); pg.wait_for_timeout(500)
    # q3 optional: skip
    check('optional question marked', pg.locator('.optional-tag').count() == 1)
    pg.click('[data-ui="skip"]'); pg.wait_for_timeout(300)
    pg.fill('#answer', LONG['q4']); pg.click('[data-ui="next"]'); pg.wait_for_timeout(500)
    # back and forward
    pg.click('[data-ui="back"]'); pg.wait_for_timeout(200)
    check('back returns to previous answer', LONG['q4'] in pg.locator('#answer').input_value())
    pg.click('[data-ui="next"]'); pg.wait_for_timeout(400)
    check('unchanged answer moves on without a second AI call', 'Question 5 of 13' in pg.locator('.qcount').inner_text())

    # resume after reload
    pg.fill('#answer', LONG['q5']); pg.wait_for_timeout(1200)
    pg.reload(); pg.wait_for_timeout(700)
    check('reload resumes at the same question with the typed answer', 'Question 5 of 13' in pg.locator('.qcount').inner_text() and LONG['q5'] in pg.locator('#answer').input_value())
    pg.click('[data-ui="next"]'); pg.wait_for_timeout(400)

    for qid in ['q6', 'q7', 'q8']:
        pg.fill('#answer', LONG[qid]); pg.click('[data-ui="next"]'); pg.wait_for_timeout(400)
    pg.click('[data-ui="skip"]'); pg.wait_for_timeout(300)  # q9 optional
    for qid in ['q10', 'q11', 'q12']:
        pg.fill('#answer', LONG[qid]); pg.click('[data-ui="next"]'); pg.wait_for_timeout(400)
    check('last stage shown', 'Stage 5 of 5' in pg.locator('.qcount').inner_text())
    pg.click('[data-ui="skip"]'); pg.wait_for_timeout(300)  # q13 optional
    check('review screen lists answers', pg.locator('.review-item').count() == 13)
    shot(pg, 'review', True)

    # edit from review returns to review
    pg.click('[data-ui="edit"][data-q="3"]'); pg.wait_for_timeout(200)
    pg.fill('#answer', LONG['q4'] + ' Then a care plan offer.'); pg.click('[data-ui="next"]'); pg.wait_for_timeout(500)
    if pg.locator('.followup').count(): pg.click('[data-ui="skipfu"]'); pg.wait_for_timeout(300)
    check('edit returns to review', pg.locator('.review-item').count() == 13 and 'care plan offer' in pg.locator('.review-stage').nth(1).inner_text())

    pg.click('[data-ui="goal"][data-value="250"]'); pg.wait_for_timeout(200)
    check('goal choice kept', pg.locator('[data-ui="goal"][data-value="250"].on').count() == 1)
    pg.click('[data-ui="generate"]'); pg.wait_for_timeout(200)
    check('generating screen', pg.locator('.generating').count() == 1 or pg.locator('.funnel').count() == 1)
    pg.wait_for_selector('.funnel', timeout=15000); pg.wait_for_timeout(500)
    check('map shows the funnel and pricing', pg.locator('.slot:not(.empty)').count() == 5 and pg.locator('.pricing').count() == 1)
    check('goal from review carried into the map', pg.locator('[data-goal="250"].on').count() == 1)
    check('next steps and version shown', pg.locator('.next-steps').count() == 1 and 'v0.6.0' in pg.locator('footer').inner_text())
    check('unverified facts shown as assumptions', pg.locator('.opp[data-opp="op2"] .status').inner_text() == 'Hypothesis to test')
    shot(pg, 'map', True)

    # edit and persist
    pg.click('.slot[data-opp="op1"]'); pg.wait_for_timeout(150)
    pg.fill('#f-name', 'Website Content Kit'); pg.wait_for_timeout(1500)
    pg.keyboard.press('Escape')
    check('saved indicator', pg.locator('#saved').inner_text() in ('Saved', 'Saving…'))
    pg.wait_for_timeout(900)
    pg.reload(); pg.wait_for_timeout(800)
    check('map edits persist across reload', pg.locator('.slot[data-opp="op1"] h3').inner_text() == 'Website Content Kit')

    # share
    pg.click('[data-app="share"]'); pg.wait_for_timeout(600)
    check('share confirmed', 'Sent to Priddy Impact Group' in pg.locator('[data-app="share"]').inner_text())
    view = pg.evaluate("""async () => { const t = localStorage.getItem('afm-token'); const r = await fetch('/api/share', {method:'POST', headers:{'x-map-token': t, 'content-type':'application/json'}, body:'{}'}); return (await r.json()).viewLink; }""")
    v = ctx.new_page(); v.goto(view.replace('https://', 'http://').replace('map.example.com', f'localhost:{os.environ.get("PORT","8791")}')); v.wait_for_timeout(700)
    check('shared view opens read-only', v.locator('.funnel').count() == 1 and 'read only' in v.locator('.toolbar').inner_text() and v.locator('[data-act="add"]').count() == 0)
    v.close()

    # print / PDF layout
    pg.emulate_media(media='print'); pg.wait_for_timeout(200)
    check('PDF hides buttons', not pg.locator('.app-tools').is_visible() and not pg.locator('#drawerRoot').is_visible())
    if shots: pg.pdf(path=str(shots / 'app-map.pdf'), landscape=True, print_background=True)
    pg.emulate_media(media='screen')

    # image export degrades gracefully when the image library cannot load
    pg.click('[data-app="png"]'); pg.wait_for_timeout(2500)
    check('image export responds', pg.locator('#toast').inner_text() != '')

    # phone
    m = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True).new_page()
    m.goto(BASE + '/?demo=1'); m.wait_for_timeout(600); m.tap('[data-ui="start"]'); m.wait_for_timeout(300)
    sw = m.evaluate('document.documentElement.scrollWidth')
    check(f'phone: interview fits ({sw})', sw <= 390)
    if shots: m.screenshot(path=str(shots / 'app-phone-question.png'), full_page=True)

    # delete
    pg.click('[data-app="delete"]'); pg.wait_for_timeout(200)
    pg.fill('#delConfirm', 'DELETE'); pg.click('[data-app="delete-confirm"]'); pg.wait_for_timeout(500)
    check('data deleted', 'deleted' in pg.locator('.card h2').inner_text())
    pg.goto(BASE + '/'); pg.wait_for_timeout(400)
    check('after deletion the link is gone', pg.locator('.hero').count() == 1)

    check('no page errors' + (f': {errors}' if errors else ''), not [e for e in errors if 'html-to-image' not in e and 'jsdelivr' not in e])
    b.close()

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
