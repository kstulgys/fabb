"use client";

import { Box, Button, chakra, Heading, Input, Stack, Text } from "@chakra-ui/react";
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
    <Box maxW="md" w="full" p="6" borderWidth="1px" borderRadius="xl">
      <Heading size="md">{heading}</Heading>
      {description ? (
        <Text color="fg.muted" fontSize="sm" mt="1" mb="5">
          {description}
        </Text>
      ) : (
        <Box mb="5" />
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="4">
          {FIELDS.map((field) => (
            <Stack key={field.key} gap="1">
              <chakra.label
                htmlFor={field.key}
                fontSize="sm"
                fontWeight="medium"
              >
                {field.label}
              </chakra.label>
              <Input
                id={field.key}
                name={field.key}
                type={field.type}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                value={values[field.key]}
                onChange={update(field.key)}
                borderColor={invalid?.field === field.key ? "red.500" : undefined}
              />
              {invalid?.field === field.key ? (
                <Text color="red.500" fontSize="sm">
                  {invalid.error}
                </Text>
              ) : null}
            </Stack>
          ))}

          <Stack gap="1">
            <Text fontSize="sm" fontWeight="medium">
              Booking email
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {me?.email
                ? `Uses your account email: ${me.email}`
                : "Uses your account email."}
            </Text>
          </Stack>

          {formError ? (
            <Text color="red.500" fontSize="sm">
              {formError}
            </Text>
          ) : null}
          {saved ? (
            <Text color="green.600" fontSize="sm">
              Details saved.
            </Text>
          ) : null}

          <Button type="submit" colorPalette="teal" loading={submitting}>
            {submitLabel}
          </Button>
        </Stack>
      </form>
    </Box>
  );
}
