import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { dueDateToneColor } from "@/lib/tone-colors";

/**
 * Due-date field for the task create + edit screens. Shows the selected
 * date in US format ("Dec 8, 2026") or a "No due date" placeholder, and
 * opens a native iOS calendar picker on tap. A clear button unsets it.
 *
 * Stores/emits a date-only "YYYY-MM-DD" string (the API parses it to UTC
 * midnight; the Tasks list renders it back in UTC). All Date↔string
 * conversion uses LOCAL Y/M/D components — never toISOString() — so the
 * day the user taps is the day that's stored (no timezone shift).
 */

function parseYmd(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d); // local midnight
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function usLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DueDateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { tokens, resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => parseYmd(value) ?? new Date());
  const selected = parseYmd(value);

  const openPicker = () => {
    setDraft(parseYmd(value) ?? new Date());
    setOpen(true);
  };

  return (
    <>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={selected ? `Due date ${usLabel(selected)}` : "Set due date"}
          className="flex-1 rounded-lg border px-3 py-2.5 justify-center"
          style={{
            borderColor: tokens.line,
            backgroundColor: tokens.bgInset,
            minHeight: 42,
          }}
        >
          <Text
            className={selected ? "text-sm font-semibold" : "text-sm"}
            style={{
              color: selected ? dueDateToneColor(value, tokens) : tokens.textTer,
            }}
          >
            {selected ? usLabel(selected) : "No due date"}
          </Text>
        </Pressable>
        {selected && (
          <Pressable
            onPress={() => onChange("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear due date"
            className="p-1.5"
          >
            <Ionicons name="close-circle" size={22} color={tokens.textTer} />
          </Pressable>
        )}
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setOpen(false)}
        >
          {/* Inner press swallows taps so they don't dismiss the sheet. */}
          <Pressable
            className="rounded-t-3xl px-5 pt-3 pb-8"
            style={{ backgroundColor: tokens.bg }}
            onPress={() => {}}
          >
            <View className="flex-row items-center justify-between mb-1">
              <Pressable
                onPress={() => {
                  onChange("");
                  setOpen(false);
                }}
                hitSlop={8}
              >
                <Text className="text-sm" style={{ color: tokens.textSec }}>
                  Clear
                </Text>
              </Pressable>
              <Text
                className="text-base font-semibold"
                style={{ color: tokens.text }}
              >
                Due date
              </Text>
              <Pressable
                onPress={() => {
                  onChange(formatYmd(draft));
                  setOpen(false);
                }}
                hitSlop={8}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: tokens.primary }}
                >
                  Done
                </Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              themeVariant={resolved}
              accentColor={tokens.primary}
              onChange={(_event, picked) => {
                if (picked) setDraft(picked);
              }}
              style={{ alignSelf: "stretch" }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
