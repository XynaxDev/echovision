import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

export interface DropdownItem {
  label: string;
  value: string;
}

interface CustomDropdownProps {
  value: string;
  items: DropdownItem[];
  onValueChange: (value: string) => void;
}

export function CustomDropdown({ value, items, onValueChange }: CustomDropdownProps) {
  const { colors } = useAppTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedItem = items.find((i) => i.value === value);

  return (
    <>
      <TouchableOpacity
        style={[styles.dropdownButton, { backgroundColor: colors.background, borderColor: colors.border }]}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.dropdownText, { color: colors.text }]}>
          {selectedItem ? selectedItem.label : value}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textSecondary }]}>Select Option</Text>
            <FlatList
              data={items}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.itemButton,
                    { borderBottomColor: colors.border },
                    item.value === value && { backgroundColor: colors.background }
                  ]}
                  onPress={() => {
                    onValueChange(item.value);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[
                    styles.itemText, 
                    { color: colors.text },
                    item.value === value && { fontWeight: "bold", color: colors.primary }
                  ]}>
                    {item.label}
                  </Text>
                  {item.value === value && (
                    <Feather name="check" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 140,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    padding: 16,
    letterSpacing: 1,
  },
  itemButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  itemText: {
    fontSize: 16,
  },
});
