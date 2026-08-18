path = "app/order/[id].tsx"
with open(path) as f:
    c = f.read()

# --- 1. Compute pathKeys right after the markers array is built ---
old_markers = '''  if (order.address?.lat && order.address?.lng) {
    markers.push({ key: "drop", lat: order.address.lat, lng: order.address.lng, label: "Drop", icon: "home", color: "2D7A4D" });
  }'''

new_markers = '''  if (order.address?.lat && order.address?.lng) {
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
  const pathKeys = headingToRestaurant ? ["rider", "rest"] : ["rest", "drop"];'''

assert old_markers in c, "MARKERS ANCHOR NOT FOUND"
c = c.replace(old_markers, new_markers, 1)

# --- 2. Pass pathKeys to GoogleMapView ---
old_map = '            <GoogleMapView markers={markers} height={260} showPath />'
new_map = '            <GoogleMapView markers={markers} height={260} showPath pathKeys={pathKeys} />'
assert c.count(old_map) == 1, "MAP JSX ANCHOR NOT FOUND OR NOT UNIQUE"
c = c.replace(old_map, new_map, 1)

with open(path, "w") as f:
    f.write(c)
print("ORDER TRACKING ROUTE PATCH APPLIED SUCCESSFULLY (2/2 anchors matched)")
