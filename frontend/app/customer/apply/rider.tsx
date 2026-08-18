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
import { FormField, FormSection, FormSelect, DocumentPicker, DobInput, isValidDob, dobToIso } from "@/src/components/form";
import { notify } from "@/src/utils/confirm";

const VEHICLE_OPTS = [
  { value: "bike" as const, label: "Bike", icon: "bicycle" as const },
  { value: "scooter" as const, label: "Scooter", icon: "speedometer" as const },
  { value: "bicycle" as const, label: "Bicycle", icon: "bicycle-outline" as const },
  { value: "ev" as const, label: "EV", icon: "flash" as const },
];

type Vehicle = "bike" | "scooter" | "bicycle" | "ev";

export default function RiderApply() {
  const router = useRouter();
  const goBack = useSmartBack();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  // Personal
  const [fullName, setFullName] = useState(user?.name || "");
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [contactEmail, setContactEmail] = useState("");
  const [dob, setDob] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  // Vehicle
  const [vehicleType, setVehicleType] = useState<Vehicle>("bike");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [rcNumber, setRcNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  // KYC
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  // Bank
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  // Docs
  const [aadhaarDoc, setAadhaarDoc] = useState<string | null>(null);
  const [licenseDoc, setLicenseDoc] = useState<string | null>(null);
  const [rcDoc, setRcDoc] = useState<string | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  const submit = async () => {
    const required: { v: string; label: string }[] = [
      { v: fullName, label: "Full name" },
      { v: contactPhone, label: "Contact phone" },
      { v: dob, label: "Date of birth" },
      { v: address, label: "Address" },
      { v: vehicleNumber, label: "Vehicle number" },
      { v: rcNumber, label: "RC number" },
      { v: licenseNumber, label: "License number" },
      { v: aadhaarNumber, label: "Aadhaar number" },
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
    if (!isValidDob(dob)) {
      notify("Invalid date", "Date of birth must be in DD-MMM-YYYY format (e.g. 12-Jan-1990)");
      return;
    }
    if (aadhaarNumber.replace(/\s/g, "").length !== 12) {
      notify("Invalid Aadhaar", "Aadhaar number must be 12 digits");
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
    if (!licenseDoc) {
      notify("Document required", "Please upload your driving license");
      return;
    }
    if (!aadhaarDoc) {
      notify("Document required", "Please upload your Aadhaar card");
      return;
    }
    if (!profilePhoto) {
      notify("Document required", "Please upload a profile photo");
      return;
    }

    setBusy(true);
    try {
      await Api.submitApplication({
        type: "rider",
        rider: {
          full_name: fullName,
          contact_phone: contactPhone,
          contact_email: contactEmail || null,
          date_of_birth: dobToIso(dob),
          city,
          address,
          pincode,
          vehicle_type: vehicleType,
          vehicle_number: vehicleNumber.toUpperCase(),
          rc_number: rcNumber.toUpperCase(),
          license_number: licenseNumber.toUpperCase(),
          aadhaar_number: aadhaarNumber.replace(/\s/g, ""),
          pan_number: pan,
          bank_account_name: bankAccountName,
          bank_account_number: bankAccountNumber,
          bank_ifsc: bankIfsc.toUpperCase(),
          aadhaar_doc: aadhaarDoc,
          license_doc: licenseDoc,
          rc_doc: rcDoc,
          profile_photo: profilePhoto,
        },
      });
      notify(
        "Application submitted",
        "Our partner team will review and revert within 24–48 hours.",
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
        <Text style={styles.headerTitle}>Delivery Rider</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>Earn on your terms</Text>
          <Text style={styles.leadSub}>We need a few details and documents to onboard you safely.</Text>

          <FormSection title="Personal Details" icon="person">
            <FormField label="Full name (as on Aadhaar)" value={fullName} onChangeText={setFullName} required />
            <FormField label="Contact phone" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" required />
            <FormField label="Contact email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
            <DobInput label="Date of birth" value={dob} onChangeText={setDob} required hint="DD-MMM-YYYY — must be 18 years or older" />
            <FormField label="Address" value={address} onChangeText={setAddress} multiline required />
            <FormField label="City" value={city} onChangeText={setCity} />
            <FormField label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="numeric" maxLength={6} />
          </FormSection>

          <FormSection title="Vehicle Details" icon="bicycle">
            <FormSelect<Vehicle>
              label="Vehicle type"
              value={vehicleType}
              onChange={setVehicleType}
              options={VEHICLE_OPTS}
              required
            />
            <FormField label="Vehicle number" value={vehicleNumber} onChangeText={setVehicleNumber} autoCapitalize="characters" placeholder="KA01AB1234" required />
            <FormField label="RC number" value={rcNumber} onChangeText={setRcNumber} autoCapitalize="characters" required />
            <FormField label="Driving license number" value={licenseNumber} onChangeText={setLicenseNumber} autoCapitalize="characters" required />
          </FormSection>

          <FormSection title="KYC" icon="shield-checkmark">
            <FormField label="Aadhaar number" value={aadhaarNumber} onChangeText={setAadhaarNumber} keyboardType="numeric" maxLength={12} required hint="12-digit Aadhaar number" />
            <FormField label="PAN number" value={panNumber} onChangeText={setPanNumber} autoCapitalize="characters" required maxLength={10} hint="Mandatory. Format: ABCDE1234F" />
          </FormSection>

          <FormSection title="Bank Details" icon="card">
            <FormField label="Account holder name" value={bankAccountName} onChangeText={setBankAccountName} required />
            <FormField label="Account number" value={bankAccountNumber} onChangeText={setBankAccountNumber} keyboardType="numeric" required />
            <FormField label="IFSC code" value={bankIfsc} onChangeText={setBankIfsc} autoCapitalize="characters" required />
          </FormSection>

          <FormSection title="Documents" icon="cloud-upload">
            <DocumentPicker label="Driving license" value={licenseDoc} onChange={setLicenseDoc} required />
            <DocumentPicker label="Aadhaar card" value={aadhaarDoc} onChange={setAadhaarDoc} required />
            <DocumentPicker label="Vehicle RC" value={rcDoc} onChange={setRcDoc} hint="Optional — speeds up verification" />
            <DocumentPicker label="Profile photo" value={profilePhoto} onChange={setProfilePhoto} required hint="Clear face photo, used on your rider ID" />
          </FormSection>

          <Button title="Submit Application" icon="send" onPress={submit} loading={busy} full style={{ marginTop: spacing.lg }} />
          <Text style={styles.legal}>By submitting you agree to our Rider Terms. Approval typically takes 24–48 hours.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 18, fontWeight: font.black, color: colors.textPrimary },
  lead: { fontSize: 22, fontWeight: font.black, color: colors.textPrimary },
  leadSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  legal: { textAlign: "center", color: colors.textMuted, fontSize: 11, marginTop: spacing.md, marginBottom: spacing.lg },
});
