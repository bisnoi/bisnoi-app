import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, Animated, Easing, Platform,
} from "react-native";
import { notify } from "@/src/utils/confirm";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { colors, spacing, radius, font, shadow } from "@/src/theme";
import { Button, Card, StatusBadge, Rating } from "@/src/components/ui";
import { GoogleMapView } from "@/src/components/GoogleMapView";
import { CancelOrderModal } from "@/src/components/CancelOrderModal";
import { getSocket, joinRoom, leaveRoom } from "@/src/socket";

type Order = any;


const FLOW = [
  { key: "placed", label: "Order placed", icon: "receipt-outline" as const, hint: "We've sent your order to the restaurant" },
  { key: "accepted", label: "Order accepted", icon: "checkmark-circle-outline" as const, hint: "Restaurant accepted your order" },
  { key: "preparing", label: "Preparing your food", icon: "restaurant-outline" as const, hint: "The chef is on it!" },
  { key: "ready", label: "Ready for pickup", icon: "fast-food-outline" as const, hint: "Food is packed and waiting" },
  { key: "picked", label: "On The Way", icon: "bicycle-outline" as const, hint: "Rider is on the way to you" },
  { key: "delivered", label: "Delivered", icon: "home-outline" as const, hint: "Enjoy your meal!" },
];

const RATING_LABELS = ["Tap a star", "Terrible", "Poor", "Average", "Good", "Loved it!"];
const RATING_EMOJI = ["⭐", "😞", "😐", "🙂", "😋", "🤩"];

const POSITIVE_TAGS = ["Hot & fresh", "Quick delivery", "Great packaging", "Tasty food", "Worth the price", "Polite rider"];
const NEGATIVE_TAGS = ["Cold food", "Late delivery", "Bad packaging", "Wrong items", "Rude rider", "Overpriced"];

export default function OrderTracking() {
  const { id, fresh, payment } = useLocalSearchParams<{ id: string; fresh?: string; payment?: string }>();
  const router = useRouter();
  const goBack = useSmartBack();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingPay, setRetryingPay] = useState(false);
  const [myReview, setMyReview] = useState<any>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubject, setReportSubject] = useState("");
  const [reportMsg, setReportMsg] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const pollTimer = useRef<any>(null);
  const simTimer = useRef<any>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const o = await Api.order(String(id));
      setOrder(o);
    } catch {} finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Fetch existing review for this order once delivered
  useEffect(() => {
    if (!id || order?.status !== "delivered") return;
    let cancelled = false;
    (async () => {
      try {
        const rev = await Api.myOrderReview(String(id));
        if (!cancelled) setMyReview(rev);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [id, order?.status]);

  // Safety-net poll of the REAL order (catches anything the socket misses,
  // e.g. restaurant marking ready, rider picking up / delivering).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const o = await Api.order(String(id));
        if (!cancelled) setOrder(o);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    pollTimer.current = t;
    return () => { cancelled = true; clearInterval(t); };
  }, [id]);

  // Live push: join this order's room so the rider marker moves the instant
  // a new GPS point arrives, and we hear about a rider being assigned right
  // away instead of waiting on the poll tick.
  useEffect(() => {
    if (!id) return;
    const s = getSocket();
    if (!s) return;
    const room = `order:${id}`;
    joinRoom(room);
    const onRiderLocation = (payload: any) => {
      if (!payload || String(payload.order_id) !== String(id)) return;
      setOrder((prev: any) => (prev ? { ...prev, rider_lat: payload.lat, rider_lng: payload.lng } : prev));
    };
    const onRiderAssigned = (payload: any) => {
      if (!payload || String(payload.order_id) !== String(id)) return;
      Api.order(String(id)).then((o: any) => setOrder(o)).catch(() => {});
    };
    s.on("rider_location", onRiderLocation);
    s.on("rider_assigned", onRiderAssigned);
    return () => {
      s.off("rider_location", onRiderLocation);
      s.off("rider_assigned", onRiderAssigned);
      leaveRoom(room);
    };
  }, [id]);

  // Stop polling once terminal
  useEffect(() => {
    if (!order) return;
    if ((order.status === "delivered" || order.status === "cancelled") && pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, [order?.status]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header title="Order" onBack={goBack} />
        <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40 }}>Order not found.</Text>
      </SafeAreaView>
    );
  }

  const currentStepIdx = FLOW.findIndex((s) => s.key === order.status);
  const isDelivered = order.status === "delivered";
  const isCancelled = order.status === "cancelled";

  // Stable marker keys (rest/rider/drop) so the Leaflet WebView can move the
  // existing pin smoothly rather than re-rendering on every poll tick.
  const markers: any[] = [];
  if (order.restaurant_lat && order.restaurant_lng) {
    markers.push({ key: "rest", lat: order.restaurant_lat, lng: order.restaurant_lng, label: order.restaurant_name || "Restaurant", icon: "restaurant", color: "F59E0B" });
  }
  // Show rider as soon as one is assigned (preparing/ready) so the map feels
  // alive — backend seeds rider_lat at the restaurant from `picked` onward,
  // but we also fall back to restaurant coords for earlier stages.
  const showRider = order.rider_id && ["accepted", "preparing", "ready", "picked", "delivered"].includes(order.status);
  if (showRider) {
    const rlat = order.rider_lat ?? order.restaurant_lat;
    const rlng = order.rider_lng ?? order.restaurant_lng;
    if (rlat && rlng) {
      markers.push({ key: "rider", lat: rlat, lng: rlng, label: order.rider_name || "Rider", icon: "rider", color: "D94838" });
    }
  }
  if (order.address?.lat && order.address?.lng) {
    markers.push({ key: "drop", lat: order.address.lat, lng: order.address.lng, label: "Drop", icon: "home", color: "2D7A4D" });
  }
  // Only ever draw ONE route segment at a time, instead of a single line
  // connecting rest→rider→drop (which visually looked like two lines meeting
  // at the rider). While the rider is heading to the restaurant (assigned
  // but not yet picked up), show rider→restaurant. Before assignment, and
  // again once the order is picked up, show restaurant→drop — the rider's
  // own live position (updated via rider_lat/rider_lng) then tracks along
  // that same restaurant→drop line as they head to the customer.
  const headingToRestaurant = showRider && ["accepted", "preparing", "ready"].includes(order.status);
  const pathKeys = headingToRestaurant ? ["rider", "rest"] : ["rest", "drop"];

  const submitReview = async () => {
    if (rating < 1) {
      notify("Please select a rating", "Tap a star to rate your order.");
      return;
    }
    setSubmitting(true);
    try {
      // Combine selected tags with free-form comment
      const tagText = tags.length ? tags.join(" • ") : "";
      const finalComment = [tagText, comment.trim()].filter(Boolean).join("\n");
      const rev: any = await Api.addReview({
        restaurant_id: order.restaurant_id,
        order_id: order.id,
        rating,
        comment: finalComment,
      });
      setMyReview(rev);
      setReviewOpen(false);
      setComment("");
      setTags([]);
      notify("Thanks for rating!", `You rated ${order.restaurant_name} ${rating} star${rating > 1 ? "s" : ""}.`);
    } catch (e: any) {
      const msg = e?.message || "Could not submit review";
      if (msg.toLowerCase().includes("already reviewed")) {
        // Pull the existing review and surface it
        try {
          const rev = await Api.myOrderReview(String(order.id));
          if (rev) setMyReview(rev);
        } catch {}
        setReviewOpen(false);
        notify("Already rated", "You've already reviewed this order.");
      } else {
        notify("Failed", msg);
      }
    } finally { setSubmitting(false); }
  };

  const toggleTag = (t: string) => {
    setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const openReviewModal = () => {
    setRating(0);
    setComment("");
    setTags([]);
    setReviewOpen(true);
  };

  const ISSUE_PRESETS = [
    "Food quality issue",
    "Items missing",
    "Late delivery",
    "Wrong order received",
    "Payment / refund issue",
    "Rider behaviour",
  ];

  const submitComplaint = async () => {
    if (!reportSubject.trim()) {
      notify("Select an issue", "Please choose or enter what went wrong.");
      return;
    }
    if (!reportMsg.trim()) {
      notify("Add details", "Please describe the issue so we can help.");
      return;
    }
    setReporting(true);
    try {
      await Api.createComplaint({
        order_id: order.id,
        subject: reportSubject.trim(),
        message: reportMsg.trim(),
      });
      setReportOpen(false);
      setReportDone(true);
      setReportSubject("");
      setReportMsg("");
      notify("Complaint submitted", "Our team will look into it. Track replies under Profile → My Complaints.");
    } catch (e: any) {
      notify("Failed", e?.message || "Could not submit complaint");
    } finally {
      setReporting(false);
    }
  };

  const payStatus = String(order.payment_status || "pending").toLowerCase();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header title="Track Order" subtitle={`#${String(order.id).slice(0, 8).toUpperCase()}`} onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.md }}>
        {fresh && (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.successSoft, borderColor: colors.success }}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: font.black, color: colors.success }}>Order placed successfully!</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>You will be notified as the status changes.</Text>
            </View>
          </Card>
        )}

        {/* Status header */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel}>STATUS</Text>
              <Text style={styles.statusTitle}>{FLOW[currentStepIdx]?.label || order.status}</Text>
              {!isDelivered && !isCancelled && (
                <Text style={styles.statusHint}>{FLOW[currentStepIdx]?.hint || "Updating…"}</Text>
              )}
            </View>
            <StatusBadge status={order.status} />
          </View>
          {!isCancelled && (
            <View style={styles.eta}>
              <Ionicons name="time" size={18} color={colors.primary} />
              <Text style={{ color: colors.textPrimary, fontWeight: font.bold }}>
                {isDelivered ? "Delivered" : `Arriving in ~${Math.max(5, 35 - currentStepIdx * 6)} mins`}
              </Text>
            </View>
          )}
        </Card>

        {/* Map */}
        {!isCancelled && markers.length >= 1 && (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <GoogleMapView markers={markers} height={260} showPath pathKeys={pathKeys} />
            {showRider && (
              <View style={styles.riderInfo}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="bicycle" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: font.bold, color: colors.textPrimary }}>{order.rider_name || "Your rider"}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {order.status === "picked" ? "On the way to your location" : order.status === "delivered" ? "Order delivered" : "Waiting at the restaurant"}
                  </Text>
                </View>
                <TouchableOpacity style={styles.callBtn}>
                  <Ionicons name="call" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}

        {/* Status timeline */}
        <Card>
          <Text style={styles.metaLabel}>TIMELINE</Text>
          <View style={{ marginTop: spacing.md }}>
            {FLOW.map((step, idx) => {
              const done = idx <= currentStepIdx && !isCancelled;
              const active = idx === currentStepIdx && !isDelivered && !isCancelled;
              return (
                <View key={step.key} style={styles.timelineRow}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.dot, done && { backgroundColor: colors.primary, borderColor: colors.primary }, active && { backgroundColor: "#fff", borderColor: colors.primary, borderWidth: 3 }]}>
                      {done && !active && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    {idx < FLOW.length - 1 && <View style={[styles.line, done && idx < currentStepIdx && { backgroundColor: colors.primary }]} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.lg }}>
                    <Text style={[styles.timelineLabel, done && { color: colors.textPrimary }, active && { color: colors.primary, fontWeight: font.black }]}>{step.label}</Text>
                    <Text style={styles.timelineHint}>{step.hint}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          {isCancelled && (
            <View style={{ padding: 12, borderRadius: radius.md, backgroundColor: colors.errorSoft, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="close-circle" size={20} color={colors.error} />
              <Text style={{ color: colors.error, fontWeight: font.bold }}>This order was cancelled.</Text>
            </View>
          )}
        </Card>

        {/* Restaurant */}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="restaurant" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel}>FROM</Text>
              <Text style={styles.metaValue}>{order.restaurant_name}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push(`/restaurant/${order.restaurant_id}` as any)}>
              <Text style={{ color: colors.primary, fontWeight: font.bold, fontSize: 13 }}>VIEW</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Items */}
        <Card>
          <Text style={styles.metaLabel}>ITEMS</Text>
          <View style={{ marginTop: spacing.sm, gap: 6 }}>
            {order.items.map((it: any, idx: number) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={{ color: colors.textPrimary, flex: 1, fontWeight: font.semi }} numberOfLines={1}>
                  {it.quantity} × {it.name}
                </Text>
                <Text style={{ color: colors.textSecondary, fontWeight: font.semi }}>₹{it.price * it.quantity}</Text>
              </View>
            ))}
          </View>
          <View style={styles.divider} />
          <Row label="Item total" value={`₹${order.subtotal}`} />
          {order.discount > 0 && <Row label="Discount" value={`- ₹${order.discount}`} color={colors.success} />}
          <Row label="Delivery fee" value={order.delivery_fee === 0 ? "FREE" : `₹${order.delivery_fee}`} />
          {order.packing_charge > 0 && <Row label="Packing charge" value={`₹${order.packing_charge}`} />}
          {order.gst_amount > 0 && <Row label={`GST (${order.gst_percent || 0}%)`} value={`₹${order.gst_amount}`} />}
          <View style={styles.divider} />
          <Row label="Total paid" value={`₹${order.total}`} bold />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }}>
            <Ionicons name={order.payment_method === "cod" ? "cash" : "card"} size={14} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
              {order.payment_method === "cod" ? "Cash on Delivery" : "Online Payment (Razorpay)"}
            </Text>
            <View style={[styles.payPill, { backgroundColor: payStatus === "paid" ? colors.successSoft : payStatus === "failed" ? colors.errorSoft : colors.surfaceAlt }]}>
              <Text style={{ fontSize: 11, fontWeight: font.black, color: payStatus === "paid" ? colors.success : payStatus === "failed" ? colors.error : colors.textSecondary }}>
                {payStatus.toUpperCase()}
              </Text>
            </View>
          </View>
        </Card>

        {/* Delivery address */}
        <Card>
          <Text style={styles.metaLabel}>DELIVER TO</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            <Ionicons name="location" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.metaValue}>{order.address?.label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {order.address?.line1}, {order.address?.city}
              </Text>
            </View>
          </View>
        </Card>

        {/* Review section — shown after delivery */}
        {isDelivered && (
          myReview ? (
            <Card style={styles.reviewCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={styles.reviewIconWrap}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: font.black, color: colors.textPrimary, fontSize: 15 }}>You've rated this order</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Thanks for your feedback!</Text>
                </View>
                <Rating value={myReview.rating} size={13} />
              </View>
              {!!myReview.comment && (
                <View style={styles.myReviewBody}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 19 }}>“{myReview.comment}”</Text>
                </View>
              )}
            </Card>
          ) : (
            <Card style={styles.rateCallout}>
              <Text style={{ fontWeight: font.black, color: colors.textPrimary, fontSize: 16 }}>How was your order?</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>Tap a star to rate {order.restaurant_name}</Text>
              <View style={styles.quickStars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={n}
                    activeOpacity={0.7}
                    onPress={() => { setRating(n); setComment(""); setTags([]); setReviewOpen(true); }}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  >
                    <Ionicons name="star-outline" size={36} color={colors.warning} />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={openReviewModal} style={styles.writeReviewLink}>
                <Ionicons name="create-outline" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: font.bold, fontSize: 13 }}>Write a detailed review</Text>
              </TouchableOpacity>
            </Card>
          )
        )}
        {/* Cancel order section (only for active orders) */}
        {!isDelivered && !isCancelled && (
          <Card style={{ borderColor: colors.error + "44" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.reportIcon, { backgroundColor: colors.errorSoft }]}>
                <Ionicons name="close-circle" size={22} color={colors.error} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: font.black, color: colors.textPrimary, fontSize: 15 }}>Need to cancel?</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  Free cancel within 1 minute. After that, refund depends on the phase.
                </Text>
              </View>
            </View>
            <Button
              title="Cancel Order"
              variant="secondary"
              icon="close-circle-outline"
              onPress={() => setCancelOpen(true)}
              full
              style={{ marginTop: spacing.md }}
              testID="cancel-order-btn"
            />
          </Card>
        )}

        {/* Show cancellation summary if cancelled */}
        {isCancelled && order.cancellation_details && (
          <Card style={{ backgroundColor: colors.errorSoft, borderColor: colors.error }}>
            <Text style={{ fontWeight: font.black, color: colors.error, fontSize: 14 }}>Order cancelled</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 13, marginTop: 6 }}>
              Phase: {String(order.cancellation_details.phase || "").replace("_", " ")}
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 13, marginTop: 2 }}>
              Refund: \u20B9{order.cancellation_details.customer_refund_amount || 0} ({order.cancellation_details.customer_refund_pct || 0}%)
            </Text>
            {order.cancellation_details.reason ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                Reason: {order.cancellation_details.reason}
              </Text>
            ) : null}
          </Card>
        )}

        {/* Report an issue */}
        <Card style={styles.reportCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.reportIcon}>
              <Ionicons name="alert-circle" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: font.black, color: colors.textPrimary, fontSize: 15 }}>Need help with this order?</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {reportDone ? "Complaint submitted — track it under My Complaints." : "Report an issue and our team will assist you."}
              </Text>
            </View>
          </View>
          <Button
            title={reportDone ? "Report another issue" : "Report an Issue"}
            variant="secondary"
            icon="chatbox-ellipses-outline"
            onPress={() => { setReportSubject(""); setReportMsg(""); setReportOpen(true); }}
            full
            style={{ marginTop: spacing.md }}
            testID="report-issue-btn"
          />
        </Card>

        <Button title="Back to home" variant="secondary" onPress={() => router.replace("/customer" as any)} full />
      </ScrollView>

      {/* Review modal */}
      <Modal visible={reviewOpen} animationType="slide" transparent onRequestClose={() => setReviewOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: font.black, color: colors.textPrimary }}>Rate your order</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>{order.restaurant_name}</Text>
              </View>
              <TouchableOpacity onPress={() => setReviewOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
              {/* Animated emoji + label */}
              <View style={{ alignItems: "center", marginBottom: spacing.md }}>
                <Text style={{ fontSize: 48, marginBottom: 4 }}>{RATING_EMOJI[rating]}</Text>
                <Text style={{ fontSize: 15, fontWeight: font.black, color: rating > 0 ? colors.primary : colors.textSecondary, letterSpacing: 0.3 }}>
                  {RATING_LABELS[rating]}
                </Text>
              </View>

              {/* Big stars */}
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                    <Ionicons
                      name={n <= rating ? "star" : "star-outline"}
                      size={44}
                      color={n <= rating ? colors.warning : colors.borderStrong}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tag chips — show only after rating */}
              {rating > 0 && (
                <View style={{ marginTop: spacing.lg }}>
                  <Text style={styles.sectionLabel}>{rating >= 4 ? "What did you love?" : rating === 3 ? "What could be better?" : "What went wrong?"}</Text>
                  <View style={styles.tagWrap}>
                    {(rating >= 4 ? POSITIVE_TAGS : NEGATIVE_TAGS).map((t) => {
                      const active = tags.includes(t);
                      return (
                        <TouchableOpacity
                          key={t}
                          onPress={() => toggleTag(t)}
                          activeOpacity={0.8}
                          style={[styles.tag, active && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                        >
                          {active && <Ionicons name="checkmark" size={13} color={colors.primary} />}
                          <Text style={{ color: active ? colors.primary : colors.textSecondary, fontWeight: font.semi, fontSize: 12 }}>{t}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Comment */}
              <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Additional comments (optional)</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Tell us more about your experience…"
                placeholderTextColor={colors.textMuted}
                style={styles.reviewInput}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
              <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: "right", marginTop: 4 }}>{comment.length}/500</Text>

              <Button
                title="Submit Review"
                onPress={submitReview}
                loading={submitting}
                disabled={rating < 1}
                icon="paper-plane"
                full
                style={{ marginTop: spacing.lg }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Report issue modal */}
      <Modal visible={reportOpen} animationType="slide" transparent onRequestClose={() => setReportOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: font.black, color: colors.textPrimary }}>Report an issue</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>Order #{String(order.id).slice(0, 8).toUpperCase()} • {order.restaurant_name}</Text>
              </View>
              <TouchableOpacity onPress={() => setReportOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionLabel}>What went wrong?</Text>
              <View style={styles.tagWrap}>
                {ISSUE_PRESETS.map((t) => {
                  const activeTag = reportSubject === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      testID={`issue-preset-${t}`}
                      onPress={() => setReportSubject(t)}
                      activeOpacity={0.8}
                      style={[styles.tag, activeTag && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                    >
                      {activeTag && <Ionicons name="checkmark" size={13} color={colors.primary} />}
                      <Text style={{ color: activeTag ? colors.primary : colors.textSecondary, fontWeight: font.semi, fontSize: 12 }}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Subject</Text>
              <TextInput
                value={reportSubject}
                onChangeText={setReportSubject}
                placeholder="Brief subject for your issue"
                placeholderTextColor={colors.textMuted}
                style={styles.reportSubjectInput}
                maxLength={80}
                testID="report-subject-input"
              />

              <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Describe the issue</Text>
              <TextInput
                value={reportMsg}
                onChangeText={setReportMsg}
                placeholder="Tell us what happened so we can resolve it quickly…"
                placeholderTextColor={colors.textMuted}
                style={styles.reviewInput}
                multiline
                numberOfLines={4}
                maxLength={600}
                testID="report-message-input"
              />
              <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: "right", marginTop: 4 }}>{reportMsg.length}/600</Text>

              <Button
                title="Submit Complaint"
                onPress={submitComplaint}
                loading={reporting}
                disabled={!reportSubject.trim() || !reportMsg.trim()}
                icon="paper-plane"
                full
                style={{ marginTop: spacing.lg }}
                testID="report-submit-btn"
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Cancel Order modal */}
      <CancelOrderModal
        visible={cancelOpen}
        orderId={String(order.id)}
        actor="customer"
        onClose={() => setCancelOpen(false)}
        onCancelled={(res) => {
          if (res?.order) setOrder(res.order);
          notify(
            "Order cancelled",
            res?.outcome?.customer_refund_pct
              ? `Refund of \u20B9${res.outcome.customer_refund_amount} (${res.outcome.customer_refund_pct}%) will be processed.`
              : "Your order has been cancelled.",
          );
        }}
      />
    </SafeAreaView>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.headerSub}>{subtitle}</Text>}
      </View>
    </View>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: bold ? font.bold : font.reg }}>{label}</Text>
      <Text style={{ color: color || colors.textPrimary, fontSize: bold ? 15 : 13, fontWeight: bold ? font.black : font.semi }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  payRetryBtn: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  payPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: font.black, color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2, letterSpacing: 0.5 },
  metaLabel: { fontSize: 11, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.5 },
  metaValue: { fontSize: 15, fontWeight: font.bold, color: colors.textPrimary, marginTop: 2 },
  statusTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary, marginTop: 4 },
  statusHint: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  eta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, padding: 10, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  riderInfo: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineLeft: { alignItems: "center", width: 20 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  timelineLabel: { fontSize: 14, fontWeight: font.semi, color: colors.textMuted },
  timelineHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  modalBg: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  reviewInput: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, padding: 12, marginTop: spacing.lg, fontSize: 14, color: colors.textPrimary, textAlignVertical: "top", minHeight: 100 },
  sectionLabel: { fontSize: 12, fontWeight: font.black, color: colors.textSecondary, letterSpacing: 0.4 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  tag: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  starsRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: spacing.sm },
  quickStars: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: spacing.md },
  writeReviewLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.md },
  rateCallout: { alignItems: "center", paddingVertical: spacing.lg },
  reviewCard: {},
  reviewIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  myReviewBody: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  reportCard: { borderColor: colors.primary + "40" },
  reportIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  reportSubjectInput: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, marginTop: spacing.sm, fontSize: 14, color: colors.textPrimary },
});
