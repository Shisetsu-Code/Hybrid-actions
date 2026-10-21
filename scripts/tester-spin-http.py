"""KA public launcher/assets using Tester Spin's current curl Chrome profile.
Private stdio transport only; never accepts wager/command endpoints or POST.
"""
import base64
import json
import re
import sys
from urllib.parse import urlsplit
from curl_cffi import requests
from curl_cffi.requests.impersonate import DEFAULT_CHROME

version = re.fullmatch(r"chrome([0-9]+)(?:a)?", DEFAULT_CHROME)
if not version:
    raise RuntimeError("Unsupported Tester Spin HTTP Chrome profile")
agent = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
         "(KHTML, like Gecko) Chrome/" + version[1] + ".0.0.0 Safari/537.36")
session = requests.Session(impersonate="chrome", headers={
    "User-Agent": agent, "Accept-Language": "es-ES,es;q=0.9"})
print(json.dumps({"ready": True, "userAgent": agent}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    try:
        parsed = urlsplit(request["url"])
        if (parsed.scheme != "https" or parsed.hostname != "gamesdemo.kaga88.com"
                or parsed.username or parsed.password or parsed.port or parsed.fragment):
            raise ValueError("KA resource outside official launcher host")
        response = session.get(request["url"], timeout=40, allow_redirects=False,
                               headers={k: v for k, v in request.get("headers", {}).items()
                                        if k.lower() in {"accept", "referer", "range"}})
        if len(response.content) > 20 * 1024 * 1024:
            raise ValueError("KA public resource exceeds limit")
        headers = {k: v for k, v in response.headers.items()
                   if k.lower() not in {"content-encoding", "content-length", "transfer-encoding", "connection"}}
        print(json.dumps({"id": request["id"], "status": response.status_code,
                          "headers": headers, "body": base64.b64encode(response.content).decode("ascii")}), flush=True)
    except Exception:
        print(json.dumps({"id": request.get("id"), "error": "KA public HTTP transport failed"}), flush=True)
