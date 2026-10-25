"""src/ 의 원본 파일을 묶어 배포용 index.html 한 파일을 만든다.

    py build.py          index.html 생성
    py build.py --check  index.html 이 src/ 와 일치하는지만 확인 (다르면 종료 코드 1)

src/index.html 의 지시문:
    @@include <경로>@@   파일 내용을 그대로 넣는다. CSS 의 url(../fonts/*.woff2) 는 base64 로 인라인한다.
    @@json <경로>@@      JSON 을 한 줄(compact)로 넣는다.
경로는 src/ 기준이다. 외부 라이브러리나 패키지는 쓰지 않는다 (Python 3 표준 라이브러리만).
"""
import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "index.html"

DIRECTIVE = re.compile(r"@@(include|json) ([^@]+)@@")
FONT_URL = re.compile(r"url\((\.\./fonts/[^)]+\.woff2)\)")


def read(rel):
    return (SRC / rel).read_bytes().decode("utf-8").replace("\r\n", "\n")


def inline_fonts(css, base):
    def rep(m):
        data = (base / m.group(1)).resolve().read_bytes()
        return "url(data:font/woff2;base64," + base64.b64encode(data).decode("ascii") + ")"
    return FONT_URL.sub(rep, css)


def expand(m):
    kind, rel = m.group(1), m.group(2).strip()
    if kind == "json":
        return json.dumps(json.loads(read(rel)), ensure_ascii=False)
    text = read(rel)
    if text.endswith("\n"):
        text = text[:-1]
    if rel.endswith(".css"):
        text = inline_fonts(text, (SRC / rel).parent)
    return text


def build():
    return DIRECTIVE.sub(expand, read("index.html"))


def main():
    html = build()
    if "--check" in sys.argv:
        current = OUT.read_bytes().decode("utf-8").replace("\r\n", "\n") if OUT.exists() else ""
        if current != html:
            print("index.html 이 src/ 와 다릅니다. py build.py 를 실행하세요.")
            sys.exit(1)
        print("index.html 이 src/ 와 일치합니다.")
        return
    OUT.write_bytes(html.encode("utf-8"))
    print(f"index.html 생성 ({len(html.encode('utf-8')):,} bytes)")


if __name__ == "__main__":
    main()
