path = "AddressSheet.tsx"
with open(path) as f:
    c = f.read()

old = '''            {searching && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
        </View>
        <View style={{ height: MAP_HEIGHT }}>
          <GoogleMapPicker
            lat={geo?.lat ?? 0}
            lng={geo?.lng ?? 0}'''
new = '''            {searching && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
        </View>
        </SafeAreaView>
        <View style={{ height: MAP_HEIGHT }}>
          <GoogleMapPicker
            lat={geo?.lat ?? 0}
            lng={geo?.lng ?? 0}'''

if old in c:
    c = c.replace(old, new, 1)
    with open(path, "w") as f:
        f.write(c)
    print("SAFE AREA CLOSE TAG PATCH APPLIED SUCCESSFULLY")
else:
    print("⚠️ ANCHOR NOT FOUND — no changes made")
