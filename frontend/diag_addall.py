path = "src/components/AiMenuImportModal.tsx"
src = open(path, encoding="utf-8").read()
start = src.find("const addAll = async () => {")
if start == -1:
    print("ANCHOR NOT FOUND AT ALL")
else:
    end_marker = "\n  };"
    end = src.find(end_marker, start)
    block = src[start:end+len(end_marker)]
    print("=== LENGTH ===", len(block))
    print("Contains \\r:", "\r" in block)
    print("Contains tab:", "\t" in block)
    print("Contains curly quotes:", ("\u201c" in block or "\u201d" in block or "\u2018" in block or "\u2019" in block))
    print("=== FIRST 250 (repr) ===")
    print(repr(block[:250]))
    print("=== LAST 250 (repr) ===")
    print(repr(block[-250:]))
