import re
src = open("server.py", encoding="utf-8").read()
i = src.find("MENU_EXTRACT_PROMPT = (")
if i == -1:
    print("ANCHOR TEXT NOT FOUND AT ALL")
else:
    j = src.find("\n)", i)
    block = src[i:j+2]
    print("=== FOUND BLOCK (repr, first/last 300 chars) ===")
    print(repr(block[:300]))
    print("...")
    print(repr(block[-300:]))
    print("=== LENGTH ===", len(block))
    # check for \r
    print("Contains \\r:", "\r" in block)
    # check for tabs
    print("Contains tab:", "\t" in block)
    with open("live_block.bin", "wb") as f:
        f.write(block.encode("utf-8"))
