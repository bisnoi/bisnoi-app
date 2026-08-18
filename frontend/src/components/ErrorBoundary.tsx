import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { addLog } from "@/src/utils/crashLog";

type Props = { children: React.ReactNode };
type State = { error: Error | null; info: string };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    addLog("error", `[Render] ${error.message}`, info.componentStack || error.stack);
    this.setState({ info: info.componentStack || "" });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.title}>Something crashed</Text>
            <Text style={styles.msg}>{this.state.error.message}</Text>
            <Text style={styles.stack}>{this.state.info || this.state.error.stack}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.btn} onPress={() => this.setState({ error: null, info: "" })}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children as any;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#fff", paddingTop: 60 },
  title: { fontSize: 20, fontWeight: "700", color: "#c00", marginBottom: 10, marginHorizontal: 16 },
  msg: { fontSize: 15, color: "#111", marginBottom: 14 },
  stack: { fontSize: 11, color: "#666", fontFamily: "Courier" },
  btn: { padding: 16, backgroundColor: "#111", alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
});
