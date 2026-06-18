"use client";

import { Box, Button, chakra, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { type PoolDetails, validatePoolDetails } from "../../convex/poolDetails";

const EMPTY: PoolDetails = { name: "", surname: "", phone: "", email: "" };

const FIELDS: ReadonlyArray<{
  key: keyof PoolDetails;
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
  { key: "email", label: "Email", type: "email", autoComplete: "email" },
];

/**
 * The four-field Pool details form, shared by onboarding (on the dashboard, when
 * details are incomplete) and the settings screen (editing later). It prefills
 * from {@link api.users.myPoolDetails} and saves via
 * {@link api.users.setPoolDetails}.
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
  const existing = useQuery(api.users.myPoolDetails);
  const save = useMutation(api.users.setPoolDetails);
  const [values, setValues] = useState<PoolDetails>(EMPTY);
  const [invalid, setInvalid] = useState<{
    field: keyof PoolDetails;
    error: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Prefill once the existing details load (editing in settings).
  useEffect(() => {
    if (existing?.poolDetails) {
      setValues(existing.poolDetails);
    }
  }, [existing?.poolDetails]);

  const update =
    (field: keyof PoolDetails) =>
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
