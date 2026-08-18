path = "app/dinein.tsx"
with open(path) as f:
    c = f.read()

changes = 0

# 1) Import Platform
old1 = '''import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking,
} from "react-native";'''
new1 = '''import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Platform,
} from "react-native";'''
if old1 in c:
    c = c.replace(old1, new1, 1)
    changes += 1
    print("✔ imported Platform")
else:
    print("… import block not found — skipping")

# 2) Auto-redirect effect + custom-scheme handoff in openApp()
old2 = '''  const orderParams: Record<string, string> = {};
  if (rid) orderParams.rid = String(rid);
  if (tid) orderParams.tid = String(tid);
  if (t) orderParams.t = String(t);

  const openApp = () => {
    if (tid && t) {
      router.replace({ pathname: "/dinein-order", params: orderParams } as any);
    } else {
      router.replace("/customer/dinein" as any);
    }
  };'''
new2 = '''  const orderParams: Record<string, string> = {};
  if (rid) orderParams.rid = String(rid);
  if (tid) orderParams.tid = String(tid);
  if (t) orderParams.t = String(t);

  // Universal/App Links route by path, so a tapped https://bisnoi.com/dinein
  // link lands right here even inside the native app. If we're already
  // native, there's no "install the app" card to show — jump straight in.
  useEffect(() => {
    if (Platform.OS !== "web" && tid && t) {
      router.replace({ pathname: "/dinein-order", params: orderParams } as any);
    }
  }, [tid, t]);

  const openApp = () => {
    if (Platform.OS !== "web") {
      if (tid && t) router.replace({ pathname: "/dinein-order", params: orderParams } as any);
      else router.replace("/customer/dinein" as any);
      return;
    }
    // On web: hand off to the native app via its custom URL scheme. This is
    // a direct user tap (gesture), so it works even where silent JS
    // redirects to universal/app links get blocked by the browser.
    const qs = new URLSearchParams(orderParams).toString();
    const target = tid && t ? `bisnoi://dinein-order${qs ? `?${qs}` : ""}` : `bisnoi://customer/dinein`;
    Linking.openURL(target).catch(() => { /* app not installed — user can use the install button above */ });
  };'''
if old2 in c:
    c = c.replace(old2, new2, 1)
    changes += 1
    print("✔ added native auto-redirect + custom-scheme openApp()")
else:
    print("… openApp block not found — skipping")

# 3) Avoid flashing the install card while the redirect happens
old3 = '''  if (loading) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>'''
new3 = '''  if (loading) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View></SafeAreaView>;
  }

  if (Platform.OS !== "web" && tid && t) {
    // Redirecting to /dinein-order (see useEffect above) — render nothing to avoid a flash.
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>'''
if old3 in c:
    c = c.replace(old3, new3, 1)
    changes += 1
    print("✔ added no-flash early return")
else:
    print("… render block not found — skipping")

with open(path, "w") as f:
    f.write(c)

print(f"\n{changes} change(s) applied.")
if changes == 3:
    print("DINEIN DEEP-LINK PATCH APPLIED SUCCESSFULLY")
else:
    print("⚠️ Not all anchors matched — check the file manually before deploying.")
