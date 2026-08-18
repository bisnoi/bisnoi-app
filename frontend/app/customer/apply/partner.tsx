import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSmartBack } from "@/src/utils/nav";
import { Ionicons } from "@expo/vector-icons";
import { Api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { colors, spacing, font } from "@/src/theme";
import { Button } from "@/src/components/ui";
import { FormField, FormSection, FormSelect, DocumentPicker, MultiImagePicker, TimeInput, isValidTime12, time12To24 } from "@/src/components/form";
import { GoogleMapPicker, PickedLocation } from "@/src/components/GoogleMapPicker";
import * as Location from "expo-location";
import { StatePicker } from "@/src/components/StatePicker";
import { notify } from "@/src/utils/confirm";

const CUISINE_OPTS = [
  { value: "Indian", label: "Indian" },
  { value: "Chinese", label: "Chinese" },
  { value: "Italian", label: "Italian" },
  { value: "South Indian", label: "South Indian" },
  { value: "Continental", label: "Continental" },
  { value: "Desserts", label: "Desserts" },
  { value: "Beverages", label: "Beverages" },
  { value: "Fast Food", label: "Fast Food" },
];

export default function PartnerApply() {
  const router = useRouter();
  const goBack = useSmartBack();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [posConsent, setPosConsent] = useState(false);

  // Owner / business
  const [ownerName, setOwnerName] = useState(user?.name || "");
  const [businessName, setBusinessName] = useState("");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [contactEmail, setContactEmail] = useState("");
  // Restaurant
  const [restaurantName, setRestaurantName] = useState("");
  const [foodType, setFoodType] = useState<"veg" | "non_veg">("veg");
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [pincode, setPincode] = useState("");
  const [stateName, setStateName] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);

  const [recenterTo, setRecenterTo] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const onPickLocation = (loc: PickedLocation) => {
    if (loc.address) setAddress(loc.address);
    if (loc.city) setCity(loc.city);
    if (loc.state) setStateName(loc.state);
    if (loc.pincode) setPincode(loc.pincode);
  };

  const fetchDeviceLocation = async () => {
    if (Platform.OS === "web") return; // web map's own "Locate" button handles this
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setRecenterTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      /* ignore */
    } finally {
      setLocating(false);
    }
  };
  // Compliance
  const [gstNumber, setGstNumber] = useState("");
  const [fssaiNumber, setFssaiNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  // Bank
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  // Operating (12-hour with AM/PM in UI; converted to 24-hour on submit)
  const [openingTime, setOpeningTime] = useState("09:00 AM");
  const [closingTime, setClosingTime] = useState("11:00 PM");
  // Documents
  const [fssaiDoc, setFssaiDoc] = useState<string | null>(null);
  const [gstDoc, setGstDoc] = useState<string | null>(null);
  const [panDoc, setPanDoc] = useState<string | null>(null);
  const [restaurantPhotos, setRestaurantPhotos] = useState<string[]>([]);
  const [menuPhoto, setMenuPhoto] = useState<string | null>(null);

  const toggleCuisine = (v: string) => {
    setCuisines((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));
  };

  const submit = async () => {
    // Validate required fields
    const required: { v: string; label: string }[] = [
      { v: ownerName, label: "Owner name" },
      { v: businessName, label: "Business name" },
      { v: contactPhone, label: "Contact phone" },
      { v: restaurantName, label: "Restaurant name" },
      { v: address, label: "Address" },
      { v: fssaiNumber, label: "FSSAI number" },
      { v: bankAccountName, label: "Bank account name" },
      { v: bankAccountNumber, label: "Bank account number" },
      { v: bankIfsc, label: "Bank IFSC" },
    ];
    for (const r of required) {
      if (!r.v.trim()) {
        notify("Missing details", `${r.label} is required`);
        return;
      }
    }
    if (cuisines.length === 0) {
      notify("Missing details", "Pick at least one cuisine");
      return;
    }
    const pan = panNumber.trim().toUpperCase();
    if (!pan) {
      notify("Missing details", "PAN number is required");
      return;
    }
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      notify("Invalid PAN", "Enter a valid PAN number (format: ABCDE1234F)");
      return;
    }
    if (foodType === "non_veg") {
      notify("Not allowed", "Sorry, non-veg restaurants are not allowed on Bisnoi. Only pure-veg restaurants can register.");
      return;
    }
    if (!fssaiDoc) {
      notify("Document required", "Please upload your FSSAI certificate");
      return;
    }
    if (restaurantPhotos.length === 0) {
      notify("Photos required", "Please add at least one photo of your restaurant");
      return;
    }

    setBusy(true);
    try {
      await Api.submitApplication({
        type: "restaurant_partner",
        partner: {
          owner_name: ownerName,
          business_name: businessName,
          contact_phone: contactPhone,
          contact_email: contactEmail || null,
          restaurant_name: restaurantName,
          food_type: foodType,
          cuisines,
          address,
          city,
          pincode,
          lat: 0,
          lng: 0,
          gst_number: gstNumber || null,
          fssai_number: fssaiNumber,
          pan_number: pan,
          pos_consent: posConsent,
          bank_account_name: bankAccountName,
          bank_account_number: bankAccountNumber,
          bank_ifsc: bankIfsc,
          opening_time: isValidTime12(openingTime) ? time12To24(openingTime) : openingTime,
          closing_time: isValidTime12(closingTime) ? time12To24(closingTime) : closingTime,
          fssai_doc: fssaiDoc,
          gst_doc: gstDoc,
          pan_doc: panDoc,
          restaurant_photo: restaurantPhotos[0] || null,
          restaurant_photos: restaurantPhotos,
          menu_photo: menuPhoto,
        },
      });
      notify(
        "Application submitted",
        "Our team will review your application within 24–48 hours. You'll be notified once decided.",
        () => router.replace("/customer/apply" as any),
      );
    } catch (e: any) {
      notify("Couldn't submit", e?.message || "Please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Restaurant Partner</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <View style={styles.vegWarn} testID="veg-only-warning">
            <Ionicons name="leaf" size={20} color={colors.success} />
            <Text style={styles.vegWarnTxt}>
              Bisnoi is a <Text style={{ fontWeight: font.black, color: colors.success }}>pure-veg</Text> platform. Non-veg restaurants are <Text style={{ fontWeight: font.black, color: colors.error }}>not allowed</Text> on our app.
            </Text>
          </View>

          <Text style={styles.lead}>List your restaurant</Text>
          <Text style={styles.leadSub}>Tell us about your business — verification takes 24–48 hours.</Text>

          <FormSection title="Owner Details" icon="person">
            <FormField label="Owner full name" value={ownerName} onChangeText={setOwnerName} required />
            <FormField label="Business / Legal name" value={businessName} onChangeText={setBusinessName} required placeholder="e.g. Spice Garden Pvt Ltd" />
            <FormField label="Contact phone" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" required />
            <FormField label="Contact email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
          </FormSection>

          <FormSection title="Restaurant Info" icon="restaurant">
            <FormField label="Restaurant name" value={restaurantName} onChangeText={setRestaurantName} required />
            <FormSelect
              label="Restaurant type"
              value={foodType}
              onChange={setFoodType}
              required
              options={[
                { value: "veg", label: "Pure Veg", icon: "leaf" },
                { value: "non_veg", label: "Non-Veg", icon: "close-circle" },
              ]}
            />
            {foodType === "non_veg" ? (
              <View style={styles.nonVegErr} testID="non-veg-error">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.nonVegErrTxt}>Non-veg restaurants are not allowed on Bisnoi. Please select Pure Veg to continue.</Text>
              </View>
            ) : null}
            <Text style={styles.smallLabel}>Cuisines *</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
              {CUISINE_OPTS.map((c) => {
                const active = cuisines.includes(c.value);
                return (
                  <TouchableOpacity
                    key={c.value}
                    onPress={() => toggleCuisine(c.value)}
                    style={[styles.cuisChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.borderStrong }]}
                  >
                    <Text style={{ color: active ? "#fff" : colors.textSecondary, fontWeight: font.semi, fontSize: 13 }}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.locateBtn}
              activeOpacity={0.85}
              onPress={() => {
                const next = !showMap;
                setShowMap(next);
                if (next) fetchDeviceLocation();
              }}
            >
              <Ionicons name="locate" size={18} color={colors.primary} />
              <Text style={styles.locateBtnTxt}>
                {locating ? "Fetching location..." : showMap ? "Hide map" : "Fetch current location"}
              </Text>
              <Ionicons name={showMap ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            {showMap && (
              <View style={{ marginBottom: spacing.md }}>
                <GoogleMapPicker lat={0} lng={0} recenterTo={recenterTo} onChange={onPickLocation} height={260} />
                <Text style={styles.mapHint}>Search your area or tap Locate — address, city, state and pincode fill in automatically.</Text>
              </View>
            )}
            <FormField label="Address" value={address} onChangeText={setAddress} multiline required />
            <FormField label="City" value={city} onChangeText={setCity} />
            <Text style={styles.smallLabel}>State</Text>
            <TouchableOpacity
              style={styles.stateSelect}
              activeOpacity={0.85}
              onPress={() => setStatePickerOpen(true)}
            >
              <Text style={[styles.stateSelectTxt, !stateName && { color: colors.textMuted }]}>
                {stateName || "Select state"}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <StatePicker
              visible={statePickerOpen}
              value={stateName}
              onClose={() => setStatePickerOpen(false)}
              onSelect={setStateName}
            />
            <FormField label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="numeric" maxLength={6} />
            <TimeInput label="Opening time" value={openingTime} onChangeText={setOpeningTime} testID="opening-time" />
            <TimeInput label="Closing time" value={closingTime} onChangeText={setClosingTime} testID="closing-time" />
          </FormSection>

          <FormSection title="Compliance" icon="shield-checkmark">
            <FormField label="FSSAI license number" value={fssaiNumber} onChangeText={setFssaiNumber} required hint="14-digit FSSAI license is mandatory for food businesses" />
            <FormField label="GSTIN (optional)" value={gstNumber} onChangeText={setGstNumber} autoCapitalize="characters" />
            <FormField label="PAN number" value={panNumber} onChangeText={setPanNumber} autoCapitalize="characters" required maxLength={10} hint="Mandatory. Format: ABCDE1234F" />
          </FormSection>

          <FormSection title="Bisnoi POS / Dine-in" icon="hardware-chip">
            <TouchableOpacity
              testID="pos-consent"
              activeOpacity={0.8}
              onPress={() => setPosConsent((v) => !v)}
              style={styles.consentRow}
            >
              <View style={[styles.checkbox, posConsent && styles.checkboxOn]}>
                {posConsent ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
              </View>
              <Text style={styles.consentTxt}>
                I want to enable the <Text style={{ fontWeight: font.black, color: colors.primary }}>Bisnoi POS & Dine-in</Text> system for my outlet (table orders, KOTs & billing). You can change this later with admin.
              </Text>
            </TouchableOpacity>
          </FormSection>

          <FormSection title="Bank Details" icon="card">
            <FormField label="Account holder name" value={bankAccountName} onChangeText={setBankAccountName} required />
            <FormField label="Account number" value={bankAccountNumber} onChangeText={setBankAccountNumber} keyboardType="numeric" required />
            <FormField label="IFSC code" value={bankIfsc} onChangeText={setBankIfsc} autoCapitalize="characters" required />
          </FormSection>

          <FormSection title="Documents" icon="cloud-upload">
            <DocumentPicker label="FSSAI certificate" value={fssaiDoc} onChange={setFssaiDoc} required />
            <DocumentPicker label="GST certificate" value={gstDoc} onChange={setGstDoc} />
            <DocumentPicker label="PAN card" value={panDoc} onChange={setPanDoc} />
            <MultiImagePicker
              label="Restaurant photos"
              values={restaurantPhotos}
              onChange={setRestaurantPhotos}
              required
              max={6}
              hint="Add storefront, seating & ambiance photos. Tap “Add more” for additional images."
            />
            <DocumentPicker label="Menu photo" value={menuPhoto} onChange={setMenuPhoto} />
          </FormSection>

          <Button title="Submit Application" icon="send" onPress={submit} loading={busy} full style={{ marginTop: spacing.lg }} />
          <Text style={styles.legal}>By submitting you agree to our Partner Terms. Approval typically takes 24–48 hours.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  locateBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.md,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft,
  },
  locateBtnTxt: { flex: 1, color: colors.primary, fontWeight: font.bold, fontSize: 13 },
  mapHint: { color: colors.textSecondary, fontSize: 12, marginTop: 6, marginBottom: spacing.md },
  stateSelect: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: spacing.md,
    backgroundColor: colors.surface, minHeight: 48,
  },
  stateSelectTxt: { fontSize: 14, color: colors.textPrimary },
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  lead: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  vegWarn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success, borderRadius: 12, padding: 12, marginBottom: spacing.lg },
  vegWarnTxt: { flex: 1, color: colors.textPrimary, fontSize: 13, lineHeight: 18, fontWeight: font.semi },
  nonVegErr: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.errorSoft, borderRadius: 10, padding: 10, marginBottom: spacing.md },
  nonVegErrTxt: { flex: 1, color: colors.error, fontSize: 12, fontWeight: font.semi },
  leadSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  smallLabel: { fontSize: 12, fontWeight: font.bold, color: colors.textSecondary, marginBottom: 6, letterSpacing: 0.3, textTransform: "uppercase" },
  cuisChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  consentTxt: { flex: 1, fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  legal: { textAlign: "center", color: colors.textMuted, fontSize: 11, marginTop: spacing.md, marginBottom: spacing.lg },
});
