path = "src/components/AiMenuImportModal.tsx"
src = open(path, encoding="utf-8").read()
start = src.find("  const addAll = async () => {")
end = src.find("\n  };", start) + len("\n  };")
block = src[start:end]
print("=== LENGTH ===", len(block))
with open("addall_live.txt", "w", encoding="utf-8") as f:
    f.write(block)
print("=== written to addall_live.txt ===")
