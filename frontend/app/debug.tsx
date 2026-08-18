import React, { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from "react-native";
import { getLogs, clearLogs, LogEntry } from "@/src/utils/crashLog";

export default function DebugScreen() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const load = useCallback(async () => {
    setLogs(await getLogs());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shareAll = async () => {
    const text = logs
      .map((l) => `[${l.at}] ${l.type.toUpperCase()}: ${l.message}\n${l.stack || ""}`)
      .join("\n\n");
    try {
      await Share.share({ message: text || "No logs" });
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: 60 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", marginHorizontal: 16 }}>Debug Logs</Text>
      <View style={{ flexDirection: "row", gap: 10, marginHorizontal: 16, marginVertical: 10 }}>
        <TouchableOpacity onPress={load} style={styles.btn}>
          <Text style={styles.btnText}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={shareAll} style={styles.btn}>
          <Text style={styles.btnText}>Send to me</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            await clearLogs();
            load();
          }}
          style={[styles.btn, { backgroundColor: "#900" }]}
        >
          <Text style={styles.btnText}>Clear</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ paddingHorizontal: 16 }}>
        {logs.length === 0 && <Text style={{ color: "#666" }}>No logs yet.</Text>}
        {logs
          .slice()
          .reverse()
          .map((l, i) => (
            <View key={i} style={{ marginBottom: 14, borderBottomWidth: 1, borderColor: "#eee", paddingBottom: 10 }}>
              <Text style={{ fontSize: 11, color: "#999" }}>
                {l.at} — {l.type}
              </Text>
              <Text style={{ fontSize: 14, color: "#c00", fontWeight: "600" }}>{l.message}</Text>
              {!!l.stack && <Text style={{ fontSize: 10, color: "#666", fontFamily: "Courier" }}>{l.stack}</Text>}
            </View>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: "#111", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
