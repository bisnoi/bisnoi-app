path = "src/components/AiMenuImportModal.tsx"
with open(path) as f:
    c = f.read()

with open("jsx_live.txt") as f:
    old_jsx = f.read()

new_jsx = '''              {cats.map((c) => (
                <View key={c._id} style={styles.catCard} testID={`ai-cat-${c._id}`}>
                  <View style={styles.catHeader}>
                    <Ionicons name="pricetag" size={15} color={colors.primary} />
                    <TextInput
                      testID={`ai-cat-name-${c._id}`}
                      value={c.name}
                      onChangeText={(t) => updateCatName(c._id, t)}
                      placeholder="Category name"
                      placeholderTextColor={colors.textMuted}
                      style={styles.catNameInput}
                    />
                    <TouchableOpacity testID={`ai-cat-remove-${c._id}`} onPress={() => removeCat(c._id)} hitSlop={8} style={styles.catRemove}>
                      <Ionicons name="trash" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>

                  {c.items.map((it) => (
                    <View key={it._id} style={styles.itemRow} testID={`ai-item-${it._id}`}>
                      <TouchableOpacity onPress={() => updateItem(c._id, null, it._id, { veg: !it.veg })} hitSlop={6} testID={`ai-item-veg-${it._id}`}>
                        <VegDot veg={it.veg} />
                      </TouchableOpacity>
                      <View style={{ flex: 1, gap: 6 }}>
                        <TextInput
                          testID={`ai-item-name-${it._id}`}
                          value={it.name}
                          onChangeText={(t) => updateItem(c._id, null, it._id, { name: t })}
                          placeholder="Item name"
                          placeholderTextColor={colors.textMuted}
                          style={styles.itemName}
                        />
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={styles.priceWrap}>
                            <Text style={styles.rupee}>₹</Text>
                            <TextInput
                              testID={`ai-item-price-${it._id}`}
                              value={it.price}
                              onChangeText={(t) => updateItem(c._id, null, it._id, { price: t.replace(/[^0-9]/g, "") })}
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor={colors.textMuted}
                              style={styles.priceInput}
                            />
                          </View>
                          <Text style={styles.vegLabel}>{it.veg ? "Veg" : "Non-veg"}</Text>
                        </View>
                        {it.variations.map((v) => (
                          <View key={v._id} style={styles.varRow} testID={`ai-var-${v._id}`}>
                            <TextInput
                              testID={`ai-var-name-${v._id}`}
                              value={v.name}
                              onChangeText={(t) => updateVariation(c._id, null, it._id, v._id, { name: t })}
                              placeholder="Size (e.g. Small)"
                              placeholderTextColor={colors.textMuted}
                              style={styles.varNameInput}
                            />
                            <View style={styles.priceWrap}>
                              <Text style={styles.rupee}>₹</Text>
                              <TextInput
                                testID={`ai-var-price-${v._id}`}
                                value={v.price}
                                onChangeText={(t) => updateVariation(c._id, null, it._id, v._id, { price: t.replace(/[^0-9]/g, "") })}
                                keyboardType="number-pad"
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                                style={styles.priceInput}
                              />
                            </View>
                            <TouchableOpacity testID={`ai-var-remove-${v._id}`} onPress={() => removeVariation(c._id, null, it._id, v._id)} hitSlop={8}>
                              <Ionicons name="close" size={16} color={colors.error} />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity testID={`ai-item-addvar-${it._id}`} onPress={() => addVariation(c._id, null, it._id)} style={styles.addVarBtn}>
                          <Ionicons name="add" size={13} color={colors.primary} />
                          <Text style={styles.addVarText}>Add size/variation</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity testID={`ai-item-remove-${it._id}`} onPress={() => removeItem(c._id, null, it._id)} hitSlop={8} style={styles.itemRemove}>
                        <Ionicons name="close" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity testID={`ai-cat-additem-${c._id}`} onPress={() => addItem(c._id, null)} style={styles.addItemBtn}>
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={styles.addItemText}>Add item</Text>
                  </TouchableOpacity>

                  {c.subcategories.map((s) => (
                    <View key={s._id} style={styles.subCard} testID={`ai-subcat-${s._id}`}>
                      <View style={styles.subHeader}>
                        <Ionicons name="folder-outline" size={13} color={colors.textSecondary} />
                        <TextInput
                          testID={`ai-subcat-name-${s._id}`}
                          value={s.name}
                          onChangeText={(t) => updateSubcatName(c._id, s._id, t)}
                          placeholder="Sub-category name (e.g. Single Topping)"
                          placeholderTextColor={colors.textMuted}
                          style={styles.subNameInput}
                        />
                        <TouchableOpacity testID={`ai-subcat-remove-${s._id}`} onPress={() => removeSubcat(c._id, s._id)} hitSlop={8}>
                          <Ionicons name="trash" size={14} color={colors.error} />
                        </TouchableOpacity>
                      </View>

                      {s.items.map((it) => (
                        <View key={it._id} style={styles.itemRow} testID={`ai-item-${it._id}`}>
                          <TouchableOpacity onPress={() => updateItem(c._id, s._id, it._id, { veg: !it.veg })} hitSlop={6} testID={`ai-item-veg-${it._id}`}>
                            <VegDot veg={it.veg} />
                          </TouchableOpacity>
                          <View style={{ flex: 1, gap: 6 }}>
                            <TextInput
                              testID={`ai-item-name-${it._id}`}
                              value={it.name}
                              onChangeText={(t) => updateItem(c._id, s._id, it._id, { name: t })}
                              placeholder="Item name"
                              placeholderTextColor={colors.textMuted}
                              style={styles.itemName}
                            />
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <View style={styles.priceWrap}>
                                <Text style={styles.rupee}>₹</Text>
                                <TextInput
                                  testID={`ai-item-price-${it._id}`}
                                  value={it.price}
                                  onChangeText={(t) => updateItem(c._id, s._id, it._id, { price: t.replace(/[^0-9]/g, "") })}
                                  keyboardType="number-pad"
                                  placeholder="0"
                                  placeholderTextColor={colors.textMuted}
                                  style={styles.priceInput}
                                />
                              </View>
                              <Text style={styles.vegLabel}>{it.veg ? "Veg" : "Non-veg"}</Text>
                            </View>
                            {it.variations.map((v) => (
                              <View key={v._id} style={styles.varRow} testID={`ai-var-${v._id}`}>
                                <TextInput
                                  testID={`ai-var-name-${v._id}`}
                                  value={v.name}
                                  onChangeText={(t) => updateVariation(c._id, s._id, it._id, v._id, { name: t })}
                                  placeholder="Size (e.g. Small)"
                                  placeholderTextColor={colors.textMuted}
                                  style={styles.varNameInput}
                                />
                                <View style={styles.priceWrap}>
                                  <Text style={styles.rupee}>₹</Text>
                                  <TextInput
                                    testID={`ai-var-price-${v._id}`}
                                    value={v.price}
                                    onChangeText={(t) => updateVariation(c._id, s._id, it._id, v._id, { price: t.replace(/[^0-9]/g, "") })}
                                    keyboardType="number-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.priceInput}
                                  />
                                </View>
                                <TouchableOpacity testID={`ai-var-remove-${v._id}`} onPress={() => removeVariation(c._id, s._id, it._id, v._id)} hitSlop={8}>
                                  <Ionicons name="close" size={16} color={colors.error} />
                                </TouchableOpacity>
                              </View>
                            ))}
                            <TouchableOpacity testID={`ai-item-addvar-${it._id}`} onPress={() => addVariation(c._id, s._id, it._id)} style={styles.addVarBtn}>
                              <Ionicons name="add" size={13} color={colors.primary} />
                              <Text style={styles.addVarText}>Add size/variation</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity testID={`ai-item-remove-${it._id}`} onPress={() => removeItem(c._id, s._id, it._id)} hitSlop={8} style={styles.itemRemove}>
                            <Ionicons name="close" size={18} color={colors.error} />
                          </TouchableOpacity>
                        </View>
                      ))}

                      <TouchableOpacity testID={`ai-subcat-additem-${s._id}`} onPress={() => addItem(c._id, s._id)} style={styles.addItemBtn}>
                        <Ionicons name="add" size={16} color={colors.primary} />
                        <Text style={styles.addItemText}>Add item</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity testID={`ai-cat-addsubcat-${c._id}`} onPress={() => addSubcat(c._id)} style={styles.addSubcatBtn}>
                    <Ionicons name="add-circle-outline" size={15} color={colors.textSecondary} />
                    <Text style={styles.addSubcatText}>Add sub-category</Text>
                  </TouchableOpacity>
                </View>
              ))}'''

assert old_jsx in c, "JSX ANCHOR NOT FOUND"
c = c.replace(old_jsx, new_jsx, 1)

with open(path, "w") as f:
    f.write(c)
print("PATCH 3 (JSX) APPLIED, new length:", len(c))
