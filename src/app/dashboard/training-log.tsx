"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  CloseButton,
  DataList,
  Dialog,
  EmptyState,
  Field,
  Flex,
  Heading,
  IconButton,
  Input,
  NativeSelect,
  Portal,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "convex/react";
import { type ChangeEvent, useState } from "react";
import {
  LuCalendarDays,
  LuCircleCheck,
  LuClipboardList,
  LuDumbbell,
  LuPencil,
  LuPlus,
  LuX,
} from "react-icons/lu";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { format, fromColumns, requirePair } from "../../../convex/calories";
import { ConfirmDeleteButton } from "../confirm-delete-button";
import { Intensity } from "./intensity";
import { CardRowsSkeleton } from "./skeletons";

/** The fields shared by the typed-add and edit forms, held as raw input text. */
type FormValues = {
  className: string;
  date: string;
  intensity: string;
  kcalMin: string;
  kcalMax: string;
};

/** What a form hands back: parsed, with blanks collapsed to `undefined`. */
type LogInput = {
  className: string;
  date: string;
  intensity?: number;
  kcalMin?: number;
  kcalMax?: number;
};

const BLANK_FORM: FormValues = {
  className: "",
  date: "",
  intensity: "0",
  kcalMin: "",
  kcalMax: "",
};

/** A blank number input → `undefined`; a non-numeric one is dropped too. */
function parseNum(s: string): number | undefined {
  const t = s.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The typed-detail form, reused for both the "Type details" add path and the
 * edit dialog. It owns only its input text + the in-flight/error state; the
 * parent decides which mutation runs and closes the dialog on success. The
 * server is the source of truth for the rules (name + date required, Calories a
 * range), so its thrown message is surfaced verbatim rather than re-validated.
 */
function ManualLogForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: FormValues;
  submitLabel: string;
  onSubmit: (v: LogInput) => Promise<unknown>;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inline field error, mirroring the server's own pure rules so the message
  // matches its rejection (the server stays the source of truth).
  const [invalid, setInvalid] = useState<{
    field: keyof FormValues;
    error: string;
  } | null>(null);

  const set =
    (key: keyof FormValues) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setInvalid((cur) => (cur?.field === key ? null : cur));
    };

  const submit = () => {
    const className = values.className.trim();
    const date = values.date.trim();
    if (!className || !date) {
      setInvalid({
        field: className ? "date" : "className",
        error: "A class name and date are required.",
      });
      return;
    }
    const kcalMin = parseNum(values.kcalMin);
    const kcalMax = parseNum(values.kcalMax);
    try {
      // The shared Calorie-range invariant: both bounds or neither (calories.ts).
      requirePair(kcalMin, kcalMax);
    } catch (e) {
      setInvalid({
        field: kcalMin === undefined ? "kcalMin" : "kcalMax",
        error:
          e instanceof Error
            ? e.message
            : "Enter both calorie figures, or leave both blank.",
      });
      return;
    }
    setInvalid(null);
    setBusy(true);
    setError(null);
    onSubmit({
      className,
      date,
      intensity: parseNum(values.intensity),
      kcalMin,
      kcalMax,
    })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't save the log."),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Stack gap="4" pt="2">
      <Field.Root required invalid={invalid?.field === "className"}>
        <Field.Label>Class name</Field.Label>
        <Input
          value={values.className}
          onChange={set("className")}
          placeholder="e.g. Funkcinė rato"
        />
        <Field.ErrorText>
          {invalid?.field === "className" ? invalid.error : null}
        </Field.ErrorText>
      </Field.Root>
      <Field.Root required invalid={invalid?.field === "date"}>
        <Field.Label>Date</Field.Label>
        <Input type="date" value={values.date} onChange={set("date")} />
        <Field.ErrorText>
          {invalid?.field === "date" ? invalid.error : null}
        </Field.ErrorText>
      </Field.Root>
      <Field.Root>
        <Field.Label>Intensity (hearts)</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field value={values.intensity} onChange={set("intensity")}>
            <option value="0">Not rated</option>
            <option value="1">1 heart</option>
            <option value="2">2 hearts</option>
            <option value="3">3 hearts</option>
            <option value="4">4 hearts</option>
            <option value="5">5 hearts</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>
      <Flex
        gap="3"
        direction={{ base: "column", sm: "row" }}
        align={{ sm: "flex-start" }}
      >
        <Field.Root invalid={invalid?.field === "kcalMin"}>
          <Field.Label>Calories min</Field.Label>
          <Input
            type="number"
            min={0}
            value={values.kcalMin}
            onChange={set("kcalMin")}
            placeholder="optional"
          />
          <Field.ErrorText>
            {invalid?.field === "kcalMin" ? invalid.error : null}
          </Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={invalid?.field === "kcalMax"}>
          <Field.Label>Calories max</Field.Label>
          <Input
            type="number"
            min={0}
            value={values.kcalMax}
            onChange={set("kcalMax")}
            placeholder="optional"
          />
          <Field.ErrorText>
            {invalid?.field === "kcalMax" ? invalid.error : null}
          </Field.ErrorText>
        </Field.Root>
      </Flex>
      <Text fontSize="xs" color="fg.muted">
        Calories are optional — leave both blank if the class never published a
        range.
      </Text>
      <Button
        alignSelf={{ base: "stretch", sm: "flex-start" }}
        disabled={busy}
        onClick={submit}
      >
        {submitLabel}
      </Button>
      {error && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
    </Stack>
  );
}

/** The prefilled facts of a picked class, so the User sees exactly what the log
 * will capture from the schedule before adding it. */
function ClassPreview({ cls }: { cls: Doc<"classes"> }) {
  return (
    <Card.Root variant="subtle" size="sm">
      <Card.Body gap="3">
        <Text fontWeight="semibold">{cls.name}</Text>
        <DataList.Root orientation="horizontal" gap="2">
          <DataList.Item>
            <DataList.ItemLabel>Date</DataList.ItemLabel>
            <DataList.ItemValue>{cls.date}</DataList.ItemValue>
          </DataList.Item>
          <DataList.Item>
            <DataList.ItemLabel>Intensity</DataList.ItemLabel>
            <DataList.ItemValue>
              <Intensity value={cls.intensity} />
            </DataList.ItemValue>
          </DataList.Item>
          <DataList.Item>
            <DataList.ItemLabel>Calories</DataList.ItemLabel>
            <DataList.ItemValue>
              {format(fromColumns(cls), "No published calories")}
            </DataList.ItemValue>
          </DataList.Item>
        </DataList.Root>
      </Card.Body>
    </Card.Root>
  );
}

/**
 * The "pick a current-week class" add path. The class list is the shared
 * schedule cache (`weekClasses`); on add, only `(pid, date)` is sent and the
 * server copies the canonical name/intensity/Calories — the preview just shows
 * the User what that will be.
 */
function PickClassPanel({ onDone }: { onDone: () => void }) {
  const week = useQuery(api.classes.weekClasses, {});
  const addFromClass = useMutation(api.trainingLogs.addFromClass);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (week === undefined) {
    return null;
  }

  const options = week.days.flatMap((day) =>
    day.classes.map((cls) => ({
      key: `${cls.pid}|${cls.date}`,
      cls,
      label: `${day.weekday} ${cls.date} · ${cls.startTime} · ${cls.name}`,
    })),
  );

  if (options.length === 0) {
    return (
      <Alert.Root status="info" mt="2">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>
            No classes in this week&apos;s schedule. Use “Type details” to log a
            past class.
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  const picked = options.find((o) => o.key === selected)?.cls ?? null;

  const submit = () => {
    if (picked === null) return;
    setBusy(true);
    setError(null);
    addFromClass({ pid: picked.pid, date: picked.date })
      .then(() => onDone())
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't add the log."),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Stack gap="4" pt="2">
      <Field.Root>
        <Field.Label>Class</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a class…</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Field.HelperText>
          Name, intensity and Calories are filled from the schedule.
        </Field.HelperText>
      </Field.Root>

      {picked && <ClassPreview cls={picked} />}

      <Button
        alignSelf={{ base: "stretch", sm: "flex-start" }}
        disabled={picked === null || busy}
        onClick={submit}
      >
        Add log
      </Button>
      {error && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
    </Stack>
  );
}

/** The add dialog: two paths (pick a class / type details). Mounted fresh on
 * each open so the tab + form state reset. */
function AddLogDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const addManual = useMutation(api.trainingLogs.addManual);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      placement="center"
      size={{ base: "full", md: "lg" }}
      motionPreset="slide-in-bottom"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content colorPalette="teal">
            {open && (
              <>
                <Dialog.Header>
                  <Dialog.Title>Add training log</Dialog.Title>
                </Dialog.Header>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Dialog.CloseTrigger>
                <Dialog.Body>
                  <Tabs.Root defaultValue="pick" fitted>
                    <Tabs.List>
                      <Tabs.Trigger value="pick">
                        <LuCalendarDays /> Pick a class
                      </Tabs.Trigger>
                      <Tabs.Trigger value="type">
                        <LuClipboardList /> Type details
                      </Tabs.Trigger>
                    </Tabs.List>
                    <Tabs.Content value="pick">
                      <PickClassPanel onDone={onClose} />
                    </Tabs.Content>
                    <Tabs.Content value="type">
                      <ManualLogForm
                        initial={BLANK_FORM}
                        submitLabel="Add log"
                        onSubmit={async (v) => {
                          await addManual(v);
                          onClose();
                        }}
                      />
                    </Tabs.Content>
                  </Tabs.Root>
                </Dialog.Body>
                <Dialog.Footer>
                  <Button variant="outline" onClick={onClose}>
                    Close
                  </Button>
                </Dialog.Footer>
              </>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/** The edit dialog: the typed form prefilled from the log; `editLog` is
 * owner-scoped server-side and leaving Calories blank clears them. */
function EditLogDialog({
  log,
  onClose,
}: {
  log: Doc<"trainingLogs"> | null;
  onClose: () => void;
}) {
  const editLog = useMutation(api.trainingLogs.editLog);
  return (
    <Dialog.Root
      open={log !== null}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      placement="center"
      size={{ base: "full", md: "lg" }}
      motionPreset="slide-in-bottom"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content colorPalette="teal">
            {log && (
              <>
                <Dialog.Header>
                  <Dialog.Title>Edit training log</Dialog.Title>
                </Dialog.Header>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Dialog.CloseTrigger>
                <Dialog.Body>
                  <ManualLogForm
                    initial={{
                      className: log.className,
                      date: log.date,
                      intensity: String(log.intensity),
                      kcalMin: log.kcalMin != null ? String(log.kcalMin) : "",
                      kcalMax: log.kcalMax != null ? String(log.kcalMax) : "",
                    }}
                    submitLabel="Save changes"
                    onSubmit={async (v) => {
                      await editLog({ logId: log._id, ...v });
                      onClose();
                    }}
                  />
                </Dialog.Body>
                <Dialog.Footer>
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                </Dialog.Footer>
              </>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/** One log in the history with its controls. A booking-sourced log also gets a
 * "didn't go" toggle (`setAttended`); edit, delete and the toggle are all
 * owner-scoped server-side and `busy` blocks a double-fire mid-flight. */
function LogRow({
  log,
  onEdit,
}: {
  log: Doc<"trainingLogs">;
  onEdit: (log: Doc<"trainingLogs">) => void;
}) {
  const deleteLog = useMutation(api.trainingLogs.deleteLog);
  const setAttended = useMutation(api.trainingLogs.setAttended);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kcal = format(fromColumns(log));

  return (
    <Card.Root variant="outline" size="sm">
      <Card.Body>
        <Flex
          direction={{ base: "column", md: "row" }}
          gap="3"
          justify="space-between"
          align={{ md: "center" }}
        >
          <Stack gap="1" minW="0">
            <Flex gap="2" align="center" wrap="wrap">
              <Text fontWeight="semibold">{log.className}</Text>
              <Badge
                colorPalette={log.attended ? "green" : "gray"}
                variant="subtle"
              >
                {log.attended ? "Attended" : "Didn't go"}
              </Badge>
            </Flex>
            <Flex
              gap="4"
              fontSize="sm"
              color="fg.muted"
              align="center"
              wrap="wrap"
            >
              <Text>{log.date}</Text>
              <Intensity value={log.intensity} />
              <Text>{kcal}</Text>
            </Flex>
          </Stack>
          <Flex
            gap="2"
            align="center"
            justify={{ base: "flex-end", md: "flex-start" }}
            flexShrink="0"
          >
            {log.bookingId !== undefined && (
              <Button
                size="sm"
                variant="outline"
                colorPalette={log.attended ? "orange" : "green"}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void setAttended({
                    logId: log._id,
                    attended: !log.attended,
                  })
                    .catch((e) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Couldn't update the log.",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {log.attended ? <LuX /> : <LuCircleCheck />}
                {log.attended ? "Didn't go" : "Mark attended"}
              </Button>
            )}
            <IconButton
              aria-label="Edit log"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onEdit(log)}
            >
              <LuPencil />
            </IconButton>
            <ConfirmDeleteButton
              label="Delete log"
              title="Delete this log?"
              description={
                <>
                  Removes “{log.className}” on {log.date} from your training
                  history. This can’t be undone.
                </>
              }
              busy={busy}
              onConfirm={() => {
                setBusy(true);
                setError(null);
                void deleteLog({ logId: log._id })
                  .catch((e) =>
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Couldn't delete the log.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            />
          </Flex>
        </Flex>
        {error && (
          <Alert.Root status="error" mt="3">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      </Card.Body>
    </Card.Root>
  );
}

/**
 * The calling User's Training-log history — this User only (`listMine` is
 * owner-scoped server-side). Add a log by picking a current-week class or by
 * typing the details of a past one; each log can be edited or deleted.
 */
export function TrainingLog() {
  const logs = useQuery(api.trainingLogs.listMine);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Doc<"trainingLogs"> | null>(null);

  return (
    <Stack gap="6">
      <Flex
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        align={{ md: "center" }}
        gap="3"
      >
        <Stack gap="1">
          <Heading size="md">Training log</Heading>
          <Text color="fg.muted" fontSize="sm">
            Log a class you attended — pick one from this week or type the
            details of a past class. Calories are optional.
          </Text>
        </Stack>
        <Button
          w={{ base: "full", md: "auto" }}
          flexShrink="0"
          onClick={() => setAdding(true)}
        >
          <LuPlus /> Add log
        </Button>
      </Flex>

      {logs === undefined ? (
        <CardRowsSkeleton />
      ) : logs.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <LuDumbbell />
            </EmptyState.Indicator>
            <EmptyState.Title>No training logs yet</EmptyState.Title>
            <EmptyState.Description>
              Log a class you attended and your training history starts here.
            </EmptyState.Description>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : (
        <Stack gap="3">
          {logs.map((log) => (
            <LogRow key={log._id} log={log} onEdit={setEditing} />
          ))}
        </Stack>
      )}

      <AddLogDialog open={adding} onClose={() => setAdding(false)} />
      <EditLogDialog log={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}
