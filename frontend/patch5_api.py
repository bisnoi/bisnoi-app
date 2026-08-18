path = "src/api.ts"
with open(path) as f:
    c = f.read()

old_line = '  ownerBulkMenu: (items: any[]) => api("/owner/menu/bulk", { method: "POST", body: { items } }),'

assert old_line in c, "API ANCHOR NOT FOUND"
assert c.count(old_line) == 1, "API ANCHOR NOT UNIQUE"

new_block = old_line + '\n  ownerImportStructuredMenu: (payload: any) => api("/owner/menu/import-structured", { method: "POST", body: payload }),'

c = c.replace(old_line, new_block, 1)

with open(path, "w") as f:
    f.write(c)
print("PATCH 5 (api.ts) APPLIED, new length:", len(c))
