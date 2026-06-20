"use client";

import { Alert, Button, Card, Field, Input, Stack } from "@chakra-ui/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { type PoolDetailsInput, validatePoolDetails } from "../../convex/poolDetails";

const EMPTY: PoolDetailsInput = { name: "", surname: "", phone: "" };

const FIELDS: ReadonlyArray<{
  key: keyof PoolDetailsInput;
  label: string;
  type: string;
  autoComplete: string;
  placeholder?: string;
}> = [
  { key: "name", label: "First name", type: "text", autoComplete: "given-name" },
  { key: "surname", label: "Surname", type: "text", autoComplete: "family-name" },
  {
    key: "phone",
    label: "Phone",
    type: "tel",
    autoComplete: "tel",
    placeholder: "+37061234567",
  },
];

/**
 * The Pool details form (name, surname, phone), shared by onboarding (on the
 * dashboard, when details are incomplete) and the settings screen (editing
 * later). It prefills from {@link api.poolDetailsOps.myPoolDetails} and saves
 * via {@link api.poolDetailsOps.setPoolDetails}.
 *
 * The booking email is NOT asked for — it is the User's account/signup email,
 * shown read-only and stamped server-side on save, so it always matches the
 * account.
 *
 * Validation uses the exact same pure {@link validatePoolDetails} the mutation
 * runs server-side, so the inline message matches the server's rejection; the
 * server stays the source of truth.
 *
 * Self-contained: it renders its own {@link Card} surface, so callers (the
 * dashboard onboarding step and the settings screen) drop it in directly
 * without wrapping it.
 */
export function PoolDetailsForm({
  heading,
  description,
  submitLabel,
  onSaved,
}: {
  heading: string;
  description?: string;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const existing = useQuery(api.poolDetailsOps.myPoolDetails);
  const save = useMutation(api.poolDetailsOps.setPoolDetails);
  const me = useQuery(api.users.currentUser);
  const [values, setValues] = useState<PoolDetailsInput>(EMPTY);
  const [invalid, setInvalid] = useState<{
    field: keyof PoolDetailsInput;
    error: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Prefill once the existing details load (editing in settings).
  useEffect(() => {
    if (existing?.poolDetails) {
      const { name, surname, phone } = existing.poolDetails;
      // Sync the form to async-loaded server data (settings edit) — an
      // intentional one-shot effect setState, not a render-time derivation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValues({ name, surname, phone });
    }
  }, [existing?.poolDetails]);

  const update =
    (field: keyof PoolDetailsInput) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setValues((current) => ({ ...current, [field]: next }));
      setSaved(false);
      if (invalid?.field === field) setInvalid(null);
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const result = validatePoolDetails(values);
    if (!result.ok) {
      setInvalid({ field: result.field, error: result.error });
      return;
    }
    setSubmitting(true);
    try {
      await save(result.value);
      setValues(result.value); // reflect the trimmed, persisted values
      setSaved(true);
      onSaved?.();
    } catch {
      setFormError("Could not save your details. Check the fields and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card.Root variant="elevated" maxW="md" w="full">
      <Card.Body>
        <Card.Title>{heading}</Card.Title>
        {description ? (
          <Card.Description mt="1">{description}</Card.Description>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          <Stack gap="4" mt="5">
            {FIELDS.map((field) => (
              <Field.Root
                key={field.key}
                required
                invalid={invalid?.field === field.key}
              >
                <Field.Label>{field.label}</Field.Label>
                <Input
                  name={field.key}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  placeholder={field.placeholder}
                  value={values[field.key]}
                  onChange={update(field.key)}
                />
                <Field.ErrorText>
                  {invalid?.field === field.key ? invalid.error : null}
                </Field.ErrorText>
              </Field.Root>
            ))}

            <Field.Root>
              <Field.Label>Booking email</Field.Label>
              <Input value={me?.email ?? ""} disabled />
              <Field.HelperText>Uses your account email.</Field.HelperText>
            </Field.Root>

            {formError ? (
              <Alert.Root status="error">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{formError}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            ) : null}
            {saved ? (
              <Alert.Root status="success">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>Details saved.</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            ) : null}

            <Button
              type="submit"
              disabled={submitting}
              w={{ base: "full", sm: "auto" }}
              alignSelf={{ base: "stretch", sm: "flex-start" }}
            >
              {submitLabel}
            </Button>
          </Stack>
        </form>
      </Card.Body>
    </Card.Root>
  );
}
