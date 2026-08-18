path = "AddressSheet.tsx"
with open(path) as f:
    c = f.read()

changes = 0

# 1) Import SafeAreaView
old1 = '''import * as Location from "expo-location";'''
new1 = '''import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";'''
if old1 in c and 'import { SafeAreaView } from "react-native-safe-area-context";' not in c.split(old1)[0]:
    c = c.replace(old1, new1, 1)
    changes += 1
    print("✔ imported SafeAreaView")
else:
    print("… SafeAreaView already imported or anchor not found — skipping")

# 2) Wrap the header in a top-safe-area view so it clears the notch/Dynamic Island
old2 = '''      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={pickerStyles.header}>'''
new2 = '''      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.background }}>
        <View style={pickerStyles.header}>'''
if old2 in c:
    c = c.replace(old2, new2, 1)
    changes += 1
    print("✔ wrapped header opening in SafeAreaView")
else:
    print("… header opening anchor not found — skipping")

# 3) Close the SafeAreaView right after the header
old3 = '''            {searching && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
        </View>

        {/* GoogleMapPicker renders its own "Use current location" pill internally'''
new3 = '''            {searching && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
        </View>
        </SafeAreaView>

        {/* GoogleMapPicker renders its own "Use current location" pill internally'''
if old3 in c:
    c = c.replace(old3, new3, 1)
    changes += 1
    print("✔ closed SafeAreaView after header")
else:
    print("… header closing anchor not found — skipping")

with open(path, "w") as f:
    f.write(c)

print(f"\n{changes} change(s) applied.")
if changes == 3:
    print("SAFE AREA PATCH APPLIED SUCCESSFULLY")
else:
    print("⚠️ Not all anchors matched — check the file manually before deploying.")
