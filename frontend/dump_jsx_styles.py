path = "src/components/AiMenuImportModal.tsx"
src = open(path, encoding="utf-8").read()

# --- JSX block: from "{cats.map((c) => (" to its matching "))}" ---
start = src.find("              {cats.map((c) => (")
assert start != -1, "JSX START NOT FOUND"
# find the end: the line "              ))}" that closes this specific .map
end_marker = "\n              ))}"
end = src.find(end_marker, start)
assert end != -1, "JSX END NOT FOUND"
end = end + len(end_marker)
jsx_block = src[start:end]
with open("jsx_live.txt", "w", encoding="utf-8") as f:
    f.write(jsx_block)
print("JSX block length:", len(jsx_block))

# --- styles closing: from "footer: {" line to final "});" ---
fstart = src.find("  footer: {")
assert fstart != -1, "FOOTER START NOT FOUND"
fend = src.find("\n});", fstart)
assert fend != -1, "STYLES END NOT FOUND"
fend = fend + len("\n});")
styles_block = src[fstart:fend]
with open("styles_live.txt", "w", encoding="utf-8") as f:
    f.write(styles_block)
print("styles block length:", len(styles_block))
