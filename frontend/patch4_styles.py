path = "src/components/AiMenuImportModal.tsx"
with open(path) as f:
    c = f.read()

with open("styles_live.txt") as f:
    old_styles = f.read()

new_styles = old_styles.replace(
    "\n});",
    '''

  varRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  varNameInput: { flex: 1, fontSize: 12.5, fontWeight: font.semi, color: colors.textPrimary, backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  addVarBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: "flex-start" },
  addVarText: { fontSize: 11.5, fontWeight: font.bold, color: colors.primary },

  subCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", padding: spacing.sm, marginTop: spacing.sm },
  subHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  subNameInput: { flex: 1, fontSize: 13, fontWeight: font.bold, color: colors.textPrimary, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },

  addSubcatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: radius.md, marginTop: 6 },
  addSubcatText: { fontSize: 12.5, fontWeight: font.bold, color: colors.textSecondary },
});''',
    1,
)

assert old_styles in c, "STYLES ANCHOR NOT FOUND"
c = c.replace(old_styles, new_styles, 1)

with open(path, "w") as f:
    f.write(c)
print("PATCH 4 (styles) APPLIED, new length:", len(c))
