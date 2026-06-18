"use client";

import {
  Badge,
  Box,
  Button,
  Dialog,
  Field,
  Flex,
  Heading,
  Input,
  NativeSelect,
  Portal,
  Spinner,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "convex/react";
import { type ChangeEvent, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

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
  intensity: "",
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

  const set =
    (key: keyof FormValues) => (e: ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = () => {
    setBusy(true);
    setError(null);
    onSubmit({
      className: values.className,
      date: values.date,
      intensity: parseNum(values.intensity),
      kcalMin: parseNum(values.kcalMin),
      kcalMax: parseNum(values.kcalMax),
    })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't save the log."),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Stack gap="4" pt="2">
      <Field.Root required>
        <Field.Label>Class name</Field.Label>
        <Input
          value={values.className}
          onChange={set("className")}
          placeholder="e.g. Aqua aerobics"
        />
      </Field.Root>
      <Field.Root required>
        <Field.Label>Date</Field.Label>
        <Input type="date" value={values.date} onChange={set("date")} />
      </Field.Root>
      <Field.Root>
        <Field.Label>Intensity (hearts)</Field.Label>
        <Input
          type="number"
          min={0}
          max={5}
          value={values.intensity}
          onChange={set("intensity")}
          placeholder="0"
        />
      </Field.Root>
      <Flex gap="3">
        <Field.Root>
          <Field.Label>Calories min</Field.Label>
          <Input
            type="number"
            min={0}
            value={values.kcalMin}
            onChange={set("kcalMin")}
            placeholder="optional"
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Calories max</Field.Label>
          <Input
            type="number"
            min={0}
            value={values.kcalMax}
            onChange={set("kcalMax")}
            placeholder="optional"
          />
        </Field.Root>
      </Flex>
      <Text fontSize="xs" color="fg.muted">
        Calories are optional — leave both blank if the class never published a
        range.
      </Text>
      <Button
        colorPalette="teal"
        alignSelf="flex-start"
        loading={busy}
        loadingText="Saving…"
        onClick={submit}
      >
        {submitLabel}
      </Button>
      {error && (
        <Text fontSize="sm" color="red.600">
          {error}
        </Text>
      )}
    </Stack>
  );
}

/** The prefilled facts of a picked class, so the User sees exactly what the log
 * will capture from the schedule before adding it. */
function ClassPreview({ cls }: { cls: Doc<"classes"> }) {
  const hearts = cls.intensity > 0 ? "❤".repeat(cls.intensity) : "—";
  return (
    <Box borderWidth="1px" borderRadius="md" p="3">
      <Text fontWeight="semibold">{cls.name}</Text>
      <Flex gap="4" mt="1" fontSize="sm" color="fg.muted" wrap="wrap">
        <Text>{cls.date}</Text>
        <Text color="red.500">{hearts}</Text>
        <Text>
          {cls.kcalMin != null && cls.kcalMax != null
            ? `${cls.kcalMin}–${cls.kcalMax} kcal`
            : "No published calories"}
        </Text>
      </Flex>
    </Box>
  );
}

/**
 * The "pick a current-week class" add path. The class list is the shared
 * schedule cache (`weekClasses`); on add, only `(pid, date)` is sent and the
 * server copies the canonical name/intensity/Calories — the preview just shows
 * the User what that will be.
 */
function PickClassPanel({ onDone }: { onDone: () => void }) {
  const week = useQuery(api.classes.weekClasses);
  const addFromClass = useMutation(api.trainingLogs.addFromClass);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (week === undefined) {
    return (
      <Flex justify="center" py="6">
        <Spinner />
      </Flex>
    );
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
      <Text color="fg.muted" fontSize="sm" pt="2">
        No classes in this week&apos;s schedule. Use “Type details” to log a past
        class.
      </Text>
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
        colorPalette="teal"
        alignSelf="flex-start"
        disabled={picked === null || busy}
        loading={busy}
        loadingText="Adding…"
        onClick={submit}
      >
        Add log
      </Button>
      {error && (
        <Text fontSize="sm" color="red.600">
          {error}
        </Text>
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
      size="lg"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            {open && (
              <>
                <Dialog.Header>
                  <Dialog.Title>Add training log</Dialog.Title>
                </Dialog.Header>
                <Dialog.Body>
                  <Tabs.Root defaultValue="pick">
                    <Tabs.List>
                      <Tabs.Trigger value="pick">Pick a class</Tabs.Trigger>
                      <Tabs.Trigger value="type">Type details</Tabs.Trigger>
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
      size="lg"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            {log && (
              <>
                <Dialog.Header>
                  <Dialog.Title>Edit training log</Dialog.Title>
                </Dialog.Header>
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

/** One log in the history with its edit + delete controls. Delete is
 * owner-scoped server-side; `busy` blocks a double-fire mid-flight. */
function LogRow({
  log,
  onEdit,
}: {
  log: Doc<"trainingLogs">;
  onEdit: (log: Doc<"trainingLogs">) => void;
}) {
  const deleteLog = useMutation(api.trainingLogs.deleteLog);
  const [busy, setBusy] = useState(false);
  const hearts = log.intensity > 0 ? "❤".repeat(log.intensity) : "—";
  const kcal =
    log.kcalMin != null && log.kcalMax != null
      ? `${log.kcalMin}–${log.kcalMax} kcal`
      : "—";

  return (
    <Flex
      borderWidth="1px"
      borderRadius="lg"
      p="3"
      gap="3"
      align="center"
      justify="space-between"
    >
      <Box>
        <Flex gap="2" align="baseline">
          <Text fontWeight="semibold">{log.className}</Text>
          <Badge
            colorPalette={log.attended ? "green" : "gray"}
            variant="subtle"
          >
            {log.attended ? "Attended" : "Missed"}
          </Badge>
        </Flex>
        <Flex gap="4" mt="1" fontSize="sm" color="fg.muted" wrap="wrap">
          <Text>{log.date}</Text>
          <Text color="red.500">{hearts}</Text>
          <Text>{kcal}</Text>
        </Flex>
      </Box>
      <Flex gap="2" flexShrink="0">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onEdit(log)}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          colorPalette="red"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void deleteLog({ logId: log._id }).finally(() => setBusy(false));
          }}
        >
          Delete
        </Button>
      </Flex>
    </Flex>
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
    <Stack gap="3">
      <Flex justify="space-between" align="flex-start" gap="3">
        <Box>
          <Heading size="md">Training log</Heading>
          <Text color="fg.muted" fontSize="sm" mt="1">
            Record a class you attended — pick one from this week or type the
            details of a past class. Calories are optional.
          </Text>
        </Box>
        <Button
          colorPalette="teal"
          flexShrink="0"
          onClick={() => setAdding(true)}
        >
          Add log
        </Button>
      </Flex>

      {logs === undefined ? (
        <Flex justify="center" py="6">
          <Spinner />
        </Flex>
      ) : logs.length === 0 ? (
        <Text color="fg.muted" fontSize="sm">
          No training logs yet. Add one to start your history.
        </Text>
      ) : (
        <Stack gap="2">
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
