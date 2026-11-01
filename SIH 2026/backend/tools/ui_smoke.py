"""Headless browser smoke test for the document-first intake workspace.

Usage:
    chrome --headless=new --remote-debugging-port=9222 ... about:blank
    .venv/Scripts/python tools/ui_smoke.py
"""
from __future__ import annotations

import asyncio
import json
import sys

import httpx
import websockets

API = "http://127.0.0.1:8000/api/v1"
UI = "http://localhost:3001"
DEBUG = "http://127.0.0.1:9222"


async def main() -> None:
    with httpx.Client(timeout=180.0) as client:
        login = client.post(
            f"{API}/auth/login",
            json={"email": "reviewer@resilient-ai.local", "password": "Password123!"},
        )
        login.raise_for_status()
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        rows = client.get(f"{API}/intake/applications", headers=headers).json()["applications"]
        target = next(row for row in rows if row["summary"]["documents"] > 0)
        application = target["application"]
        institution_name = client.get(f"{API}/institutions", headers=headers).json()["institutions"][0]["name"]
        state = client.get(f"{API}/applications/{application['id']}/intake", headers=headers).json()
        filenames = [doc["filename"] for doc in state["documents"]]
        for document in state["documents"]:
            if document["status"] == "processed":
                extracted = client.get(f"{API}/documents/{document['id']}/extractions", headers=headers).json()
                expected_field = next(
                    (field for field in extracted["fields"] if field["normalized_value"]),
                    None,
                )
                break
        else:
            raise SystemExit("no processed document available for the UI test")

    fresh = httpx.put(f"{DEBUG}/json/new?about:blank")
    page = fresh.json() if fresh.status_code == 200 else next(
        item for item in httpx.get(f"{DEBUG}/json").json() if item["type"] == "page"
    )
    errors: list[str] = []

    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=20_000_000) as socket:
        counter = 0
        pending: dict[int, asyncio.Future] = {}

        async def reader() -> None:
            async for raw in socket:
                message = json.loads(raw)
                if "id" in message and message["id"] in pending:
                    pending.pop(message["id"]).set_result(message)
                elif message.get("method") == "Runtime.exceptionThrown":
                    details = message["params"]["exceptionDetails"]
                    errors.append(details.get("text") or details.get("exception", {}).get("description", "exception"))
                elif message.get("method") == "Runtime.consoleAPICalled" and message["params"]["type"] == "error":
                    args = message["params"]["args"]
                    errors.append(" ".join(str(arg.get("value", arg.get("description", ""))) for arg in args))

        reader_task = asyncio.create_task(reader())

        async def send(method: str, params: dict | None = None):
            nonlocal counter
            counter += 1
            future: asyncio.Future = asyncio.get_running_loop().create_future()
            pending[counter] = future
            await socket.send(json.dumps({"id": counter, "method": method, "params": params or {}}))
            result = await asyncio.wait_for(future, timeout=60)
            if "error" in result:
                raise RuntimeError(result["error"])
            return result.get("result", {})

        async def evaluate(expression: str):
            result = await send(
                "Runtime.evaluate",
                {"expression": expression, "returnByValue": True, "awaitPromise": True},
            )
            return result.get("result", {}).get("value")

        async def navigate(url: str, expect: str, timeout: float = 60.0) -> str:
            await send("Page.navigate", {"url": url})
            deadline = asyncio.get_running_loop().time() + timeout
            text = ""
            while asyncio.get_running_loop().time() < deadline:
                await asyncio.sleep(0.5)
                try:
                    text = await evaluate("document.body ? document.body.innerText : ''") or ""
                except RuntimeError:
                    text = ""
                if expect in text:
                    return text
            raise AssertionError(f"{url} never showed {expect!r}: {text[:600]}")

        await send("Page.enable")
        await send("Runtime.enable")

        await navigate(f"{UI}/login", "Sign in")
        await evaluate(f"window.localStorage.setItem('rai.token', {json.dumps(token)})")
        await evaluate(
            "window.localStorage.setItem('rai.me', JSON.stringify({"
            "id:'00000000-0000-0000-0000-000000000000',email:'reviewer@resilient-ai.local',"
            "full_name:'Reviewer',role:'reviewer',is_active:true}))"
        )

        text = await navigate(f"{UI}/applications", application["reference_no"], timeout=90)
        assert application["reference_no"] in text, text[:600]

        text = await navigate(f"{UI}/applications/new", institution_name, timeout=60)
        lowered = text.lower()
        for label in ("institution name", "application category", "academic year", "application title"):
            assert label in lowered, f"missing form field {label}: {text[:800]}"

        text = await navigate(f"{UI}/intake/{application['id']}", "Uploaded documents")
        for filename in filenames:
            assert filename in text, f"{filename} missing from the document list"
        assert "Required documents" in text
        assert "Extracted details" in text

        # The viewer must render the real uploaded page.
        image_ready = False
        deadline = asyncio.get_running_loop().time() + 60
        while asyncio.get_running_loop().time() < deadline:
            await asyncio.sleep(0.5)
            image_ready = bool(await evaluate("Boolean(document.querySelector('img[alt*=\"page 1\"]'))"))
            if image_ready:
                break
        assert image_ready, "the document page image never rendered"
        thumbs = 0
        deadline = asyncio.get_running_loop().time() + 60
        while asyncio.get_running_loop().time() < deadline and int(thumbs or 0) < 1:
            await asyncio.sleep(0.5)
            thumbs = await evaluate("document.querySelectorAll('img[alt$=\"thumbnail\"]').length")
        assert int(thumbs or 0) >= 1, "no page thumbnails rendered"

        # Extracted fields are prefilled from the pipeline.
        values = await evaluate("Array.from(document.querySelectorAll('section input')).map(i => i.value)")
        joined = " | ".join(str(value) for value in (values or []))
        assert expected_field is not None
        assert str(expected_field["normalized_value"]).split(".")[0] in joined or str(expected_field["raw_value"]) in joined, (
            f"expected {expected_field['label']} to be prefilled, saw {joined[:400]}"
        )

        # Selecting a field highlights its source region in the document.
        highlight = await evaluate(
            "(() => { const b=[...document.querySelectorAll('button[title=\"Show this value in the document\"]')][0];"
            " if(!b) return 'no-source-button'; b.click(); return 'clicked'; })()"
        )
        assert highlight == "clicked", highlight
        await asyncio.sleep(1.2)
        marked = await evaluate("document.querySelectorAll('span[aria-hidden=\"true\"]').length")
        assert int(marked or 0) >= 1, "field source highlight did not appear"

        # Switching documents keeps the viewer and updates the fields.
        switched = await evaluate(
            "(() => { const buttons=[...document.querySelectorAll('li > button')].filter(b=>b.textContent.includes('page(s)'));"
            " if(buttons.length < 2) return false; buttons[1].click(); return true; })()"
        )
        assert switched is True, "second document could not be selected"
        await asyncio.sleep(3)
        text = await evaluate("document.body.innerText") or ""
        assert "Extracted details" in text

        # Completion state and download actions are present.
        assert "Files received" in text and "Complete intake" in text or "Intake completed" in text, text[:600]

        reader_task.cancel()
        print("UI smoke: applications, create form, workspace, real page viewer, thumbnails, prefilled fields, source highlight and completion all rendered")
        if errors:
            print("console errors:", errors[:5])
            raise SystemExit(1)
        print("no console errors")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except AssertionError as exc:
        print("UI SMOKE FAILED:", exc, file=sys.stderr)
        raise SystemExit(1)
