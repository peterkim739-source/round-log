"""End-to-end checks against the local development server.

Start `npm start`, then run `python tests/browser_smoke.py`.
Requires Playwright and Chromium; see docs/TESTING.md.
"""
import json
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get("ROUND_LOG_URL", "http://127.0.0.1:4173")
ROOT = Path(__file__).resolve().parents[1]
STORAGE_KEY = "round-log:v1"

with sync_playwright() as playwright:
    executable = os.environ.get("CHROMIUM_EXECUTABLE")
    browser = playwright.chromium.launch(headless=True, **({"executable_path": executable} if executable else {}))
    context = browser.new_context(viewport={"width": 1440, "height": 1100}, timezone_id="America/Los_Angeles")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE_URL)
    expect(page.get_by_text("Your next round starts here.")).to_be_visible()

    # An ordinary training entry must survive a real browser reload.
    page.get_by_role("button", name="Log a session", exact=True).click()
    page.locator('[name="discipline"]').select_option("Jiu-jitsu")
    page.locator('[name="format"]').select_option("No-gi")
    page.locator('[name="minutes"]').fill("90")
    page.locator('[name="rounds"]').fill("6")
    page.locator('[name="effort"]').select_option("7")
    page.locator('[name="focus"]').fill("Guillotine entries")
    page.locator('[name="lesson"]').fill('<img src=x onerror="alert(1)"> Keep the grip connected.')
    page.locator('[name="next"]').fill("Review the entry with my coach.")
    page.get_by_role("button", name="Save session").click()
    expect(page.locator(".session-card")).to_have_count(1)
    page.reload()
    expect(page.locator(".session-card")).to_have_count(1)
    expect(page.locator(".session-lesson")).to_contain_text("<img src=x")
    assert page.locator(".session-content img").count() == 0

    # Editing changes a record rather than creating another one.
    page.locator("[data-edit]").click()
    page.locator('[name="rounds"]').fill("8")
    page.get_by_role("button", name="Save session").click()
    expect(page.locator(".session-card")).to_have_count(1)
    expect(page.locator(".session-meta")).to_contain_text("8 rounds")
    page.get_by_role("searchbox").fill("missing technique")
    expect(page.get_by_text("No sessions match this view.")).to_be_visible()
    page.get_by_role("searchbox").fill("guillotine connected")
    expect(page.locator(".session-card")).to_have_count(1)
    page.get_by_role("searchbox").fill("")

    # Export the actual backup, then import it twice without duplication.
    page.locator(".data-menu summary").click()
    with page.expect_download() as download_info:
        page.get_by_role("button", name="Download JSON backup").click()
    backup = json.loads(Path(download_info.value.path()).read_text())
    assert backup["sessions"][0]["rounds"] == 8
    with tempfile.TemporaryDirectory() as temporary:
        valid = Path(temporary) / "valid.json"
        invalid = Path(temporary) / "invalid.json"
        valid.write_text(json.dumps(backup))
        invalid.write_text(json.dumps({"version": 1, "sessions": backup["sessions"] + [{"id": "broken"}]}))
        page.locator("#import-file").set_input_files(str(valid))
        expect(page.get_by_role("status")).to_contain_text("Skipped 1 existing IDs")
        page.locator("#import-file").set_input_files(str(invalid))
        expect(page.get_by_role("status")).to_contain_text("valid date")
        expect(page.locator(".session-card")).to_have_count(1)

    # CSV contains the entire log, regardless of active list filters.
    with page.expect_download() as download_info:
        page.get_by_role("button", name="Export CSV").click()
    assert "Guillotine entries" in Path(download_info.value.path()).read_text()

    # Demo is transient and never merges sample data into personal records.
    page.get_by_role("button", name="Explore sample sessions").click()
    expect(page.locator("#demo-banner")).to_be_visible()
    expect(page.locator(".session-card")).to_have_count(6)
    assert len(json.loads(page.evaluate("localStorage.getItem('round-log:v1')"))["sessions"]) == 1
    page.locator(".data-menu summary").click()
    page.screenshot(path=str(ROOT / "assets" / "dashboard.jpg"), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.screenshot(path=str(ROOT / "test-results" / "mobile.png"), full_page=True)
    page.get_by_role("button", name="Back to my log").click()
    expect(page.locator(".session-card")).to_have_count(1)

    # Multi-tab writes update the live dashboard.
    other = context.new_page()
    other.goto(BASE_URL)
    other.get_by_role("button", name="Log a session", exact=True).click()
    other.locator('[name="discipline"]').select_option("Strength")
    other.get_by_role("button", name="Save session").click()
    expect(page.locator(".session-card")).to_have_count(2)
    other.close()

    # Deletion needs an explicit confirmation and preserves unrelated entries.
    page.locator("[data-edit]").first.click()
    page.get_by_role("button", name="Delete session", exact=True).click()
    page.locator("#confirm-delete").click()
    expect(page.locator(".session-card")).to_have_count(1)

    # Corrupt storage must be recoverable and must never be silently overwritten.
    page.evaluate("localStorage.setItem('round-log:v1', '{broken')")
    page.reload()
    expect(page.get_by_role("alert")).to_contain_text("could not be read")
    page.get_by_role("button", name="Log a session", exact=True).click()
    page.get_by_role("button", name="Save session").click()
    expect(page.locator("#form-error")).to_contain_text("Resolve the saved-data error")
    assert page.evaluate("localStorage.getItem('round-log:v1')") == "{broken"
    assert not errors, errors
    browser.close()
print("Browser checks passed: persistence, editing, filters, XSS text handling, export/import, demo separation, mobile width, multi-tab updates, deletion, recovery.")
