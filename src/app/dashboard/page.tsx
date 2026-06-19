"use client";

import {
  Heading,
  Icon,
  IconButton,
  Menu,
  Portal,
  Spinner,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import {
  LuCalendarDays,
  LuChartColumn,
  LuDumbbell,
  LuLogOut,
  LuRepeat2,
  LuSettings,
  LuUser,
} from "react-icons/lu";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "../app-shell";
import { PoolDetailsForm } from "../pool-details-form";
import { RequireAuth } from "../require-auth";
import { AutoBookRules } from "./auto-book-rules";
import { Stats } from "./stats";
import { TrainingLog } from "./training-log";
import { WeekCalendar } from "./week-calendar";

/** The account menu in the header: shows the signed-in email and the two
 * account actions (edit pool details, sign out). */
function AccountMenu({ email }: { email: string | undefined }) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <IconButton aria-label="Account menu" variant="ghost" size="sm">
          <LuUser />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="3xs">
            {email && (
              <Menu.ItemGroup>
                <Menu.ItemGroupLabel truncate>{email}</Menu.ItemGroupLabel>
              </Menu.ItemGroup>
            )}
            <Menu.Item value="settings" onClick={() => router.push("/settings")}>
              <LuSettings />
              Pool details
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item
              value="signout"
              color="fg.error"
              _hover={{ bg: "bg.error", color: "fg.error" }}
              onClick={() => void signOut()}
            >
              <LuLogOut />
              Sign out
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

const TABS = [
  { value: "schedule", label: "Schedule", icon: LuCalendarDays },
  { value: "autobook", label: "Auto-book", icon: LuRepeat2 },
  { value: "log", label: "Training log", icon: LuDumbbell },
  { value: "stats", label: "Stats", icon: LuChartColumn },
] as const;

/** The four dashboard sections as tabs. The tab list is a fixed bottom bar on
 * mobile (thumb-friendly, app-like) and a normal top row on desktop. */
function DashboardTabs() {
  return (
    <Tabs.Root
      defaultValue="schedule"
      variant="plain"
      pb={{ base: "24", md: "0" }}
    >
      <Tabs.List
        position={{ base: "fixed", md: "static" }}
        bottom={{ base: "0", md: "auto" }}
        insetX={{ base: "0", md: "auto" }}
        zIndex="sticky"
        bg="bg.panel"
        borderTopWidth={{ base: "1px", md: "0" }}
        borderColor="border"
        px={{ base: "1", md: "0" }}
        py={{ base: "1", md: "0" }}
        gap={{ base: "0", md: "1" }}
        justifyContent={{ base: "space-around", md: "flex-start" }}
        mb={{ base: "0", md: "6" }}
      >
        {TABS.map((t) => (
          <Tabs.Trigger
            key={t.value}
            value={t.value}
            flex={{ base: "1", md: "initial" }}
            flexDirection={{ base: "column", md: "row" }}
            gap={{ base: "1", md: "2" }}
            py="2"
            rounded="md"
            color="fg.muted"
            fontWeight="medium"
            fontSize={{ base: "xs", md: "sm" }}
            _selected={{ color: "colorPalette.fg" }}
            _hover={{ bg: "bg.muted" }}
          >
            <Icon boxSize={{ base: "5", md: "4" }}>
              <t.icon />
            </Icon>
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <Tabs.Content value="schedule">
        <WeekCalendar />
      </Tabs.Content>
      <Tabs.Content value="autobook">
        <AutoBookRules />
      </Tabs.Content>
      <Tabs.Content value="log">
        <TrainingLog />
      </Tabs.Content>
      <Tabs.Content value="stats">
        <Stats />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function Dashboard() {
  const user = useQuery(api.users.currentUser);

  return (
    <AppShell actions={<AccountMenu email={user?.email} />}>
      {user == null ? (
        <Stack align="center" py="16">
          <Spinner />
        </Stack>
      ) : !user.detailsComplete ? (
        <Stack gap="5" maxW="md" mx="auto">
          <Stack gap="1">
            <Heading size="xl">Welcome to fabb</Heading>
            <Text color="fg.muted">
              One quick step before you can book: the pool needs your details on
              every booking.
            </Text>
          </Stack>
          <PoolDetailsForm
            heading="Complete your pool details"
            description="We submit your name, surname, and phone to the pool on every booking, along with your account email. You can edit them later in settings."
            submitLabel="Save and continue"
          />
        </Stack>
      ) : (
        <DashboardTabs />
      )}
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
