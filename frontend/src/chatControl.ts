// Tiny pub/sub so the (now non-floating) Support Chat panel can be opened
// imperatively from a button placed inside Profile / Help sections.
type Listener = () => void;

const listeners = new Set<Listener>();

/** Open the global Support Chat panel (call from a Help/Profile button). */
export function openSupportChat() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

/** Subscribe the mounted SupportChat panel to open requests. */
export function subscribeOpenChat(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
