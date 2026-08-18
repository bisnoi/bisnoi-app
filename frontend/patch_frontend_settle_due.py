path = "src/components/TableOrderModal.tsx"
with open(path) as f:
    c = f.read()

old = '''  const confirmSettle = async () => {
    const payments = itsPaid
      ? [{ method: settleMethod === "other" ? "upi" : settleMethod, amount: parseFloat(itsPaidAmount) || 0 }].filter((p) => p.amount > 0)
      : splitMode
        ? [
            { method: "cash", amount: parseFloat(payCash) || 0 },
            { method: "upi", amount: parseFloat(payUpi) || 0 },
            { method: "due", amount: parseFloat(payDue) || 0 },
          ].filter((p) => p.amount > 0)
        : [{ method: settleMethod === "other" ? "upi" : settleMethod, amount: grandTotal }].filter((p) => p.amount > 0);
    if (payments.length === 0) { window.alert("Kam se kam ek payment amount daalein."); return; }
    setBusy("settle");
    try {
      const res: any = await Api.ownerSettleTable(table!.id, { payments, ...billRequestBody() });
      setSettleOpen(false);
      setAfterReceiptClose("close");
      setReceipt(res);
      onChanged();
    } catch (e: any) {
      window.alert(e?.message || "Settle karne me dikkat");
    } finally { setBusy(""); }
  };'''

new = '''  const confirmSettle = async () => {
    // "Due" is never sent as a payment method — the backend only accepts
    // cash/upi/card. Any shortfall between what's actually collected and the
    // bill total is automatically recorded as due/write-off by the backend,
    // so a "Due" amount (whole-bill or split) means simply sending less than
    // the total (or nothing at all) — never a {method:"due"} entry.
    let payments: { method: string; amount: number }[];
    if (itsPaid) {
      payments = [{ method: settleMethod === "other" || settleMethod === "due" ? "cash" : settleMethod, amount: parseFloat(itsPaidAmount) || 0 }].filter((p) => p.amount > 0);
      if (payments.length === 0) { window.alert("Amount daalein."); return; }
    } else if (splitMode) {
      payments = [
        { method: "cash", amount: parseFloat(payCash) || 0 },
        { method: "upi", amount: parseFloat(payUpi) || 0 },
      ].filter((p) => p.amount > 0);
    } else if (settleMethod === "due") {
      payments = [];
    } else {
      payments = [{ method: settleMethod === "other" ? "upi" : settleMethod, amount: grandTotal }].filter((p) => p.amount > 0);
    }
    setBusy("settle");
    try {
      const res: any = await Api.ownerSettleTable(table!.id, { payments, ...billRequestBody() });
      setSettleOpen(false);
      setAfterReceiptClose("close");
      setReceipt(res);
      onChanged();
    } catch (e: any) {
      window.alert(e?.message || "Settle karne me dikkat");
    } finally { setBusy(""); }
  };'''

assert old in c, "FRONTEND ANCHOR NOT FOUND"
c = c.replace(old, new, 1)

with open(path, "w") as f:
    f.write(c)
print("FRONTEND PATCH APPLIED SUCCESSFULLY")
