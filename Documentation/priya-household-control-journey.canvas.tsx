import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Text,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

type Stage = {
  short: string;
  title: string;
  actor: string;
  outcome: string;
  surfaces: string[];
  actions: string[];
  benefits: string[];
  costs: string[];
  security: string[];
  features: string[];
};

const stages: Stage[] = [
  {
    short: "Consolidate",
    title: "Priya replaces a fragmented household setup",
    actor: "Priya",
    outcome: "One Prism policy model replaces repeated settings without pretending that one process can enforce everything.",
    surfaces: [
      "Prism website and install guide",
      "Native Prism installer",
      "Browser extension",
      "Local migration and policy wizard",
    ],
    actions: [
      "Priya inventories her DNS filters, VPN routes, browser blockers, userscripts and private services.",
      "She installs Native Prism on her always-on home server and the browser extension in her supported desktop browsers.",
      "Prism imports compatible lists and settings as disabled drafts for review.",
      "She creates device groups for adults, children, IoT and shared entertainment devices.",
    ],
    benefits: [
      "One policy vocabulary and activity history.",
      "Existing investments can be imported instead of recreated manually.",
      "The native host and UI arrive through one installer.",
    ],
    costs: [
      "Initial migration still requires review and testing.",
      "The browser extension remains a separate install because the native app cannot safely modify browser pages alone.",
      "Unsupported legacy scripts may remain in their original managers.",
    ],
    security: [
      "Imports are data until Priya explicitly activates them.",
      "Broad permissions are explained by enforcement layer and narrowed internally per feature.",
      "The native service is highly privileged and requires signed updates and a narrow IPC surface.",
    ],
    features: [
      "Migration assistant",
      "Device groups",
      "Shared policy schema",
      "Layer-aware diagnostics",
    ],
  },
  {
    short: "Home network",
    title: "Priya protects devices that cannot run extensions",
    actor: "Priya and the Prism gateway",
    outcome: "Smart devices receive DNS and egress policy while local-only functions remain available.",
    surfaces: [
      "Native Prism network dashboard",
      "Gateway device inventory",
      "DNS and egress policy editor",
      "Local activity log",
    ],
    actions: [
      "Priya enables known advertising, tracking, gambling and crypto-domain filters.",
      "She allows her garage camera to reach the local recorder but denies undeclared internet destinations.",
      "The shared television receives a less restrictive entertainment profile.",
      "Prism shows which domain or rule blocked each attempted connection.",
    ],
    benefits: [
      "One gateway protects IoT and shared devices without per-device browser software.",
      "Per-device policy avoids weakening the entire household for one exception.",
      "Known phone-home destinations can be blocked before a connection is established.",
    ],
    costs: [
      "DNS and firewall rules cannot identify content inside encrypted first-party traffic.",
      "Aggressive rules can break firmware updates, login flows or media services.",
      "The gateway becomes important household infrastructure.",
    ],
    security: [
      "No general HTTPS interception is enabled.",
      "Logs can reveal household behaviour and remain local by default.",
      "Local service access is authenticated and restricted by device identity.",
    ],
    features: [
      "DNS filtering",
      "Device egress controls",
      "Exact rule explanation",
      "Local-only IoT policy",
    ],
  },
  {
    short: "Private services",
    title: "Priya stops remembering homelab ports",
    actor: "Priya",
    outcome: "Jellyfin and other private services receive stable names and authenticated private routes.",
    surfaces: [
      "Private service catalogue",
      "Private DNS editor",
      "Reverse-proxy configuration",
      "Device and user access policy",
    ],
    actions: [
      "Priya registers Jellyfin as a private service backed by her media server's local port.",
      "Prism assigns a stable private name and terminates HTTPS at her gateway.",
      "She grants the family group access while denying IoT devices.",
      "The service remains unavailable from the public internet.",
    ],
    benefits: [
      "Users remember service names rather than addresses and ports.",
      "Access policy attaches to a service instead of each backend host.",
      "The backend can move without changing the user-facing address.",
    ],
    costs: [
      "Private naming and certificates require gateway availability.",
      "Non-HTTP services need separate protocol support.",
      "Custom public domains introduce DNS and certificate-management complexity.",
    ],
    security: [
      "The reverse proxy is limited to Priya's declared private services.",
      "Publishing a private service is a separate explicit action.",
      "Service ACLs are evaluated before traffic reaches the backend.",
    ],
    features: [
      "Private DNS",
      "Service catalogue",
      "Authenticated reverse proxy",
      "Group access policy",
    ],
  },
  {
    short: "Roam",
    title: "Priya carries household policy away from home",
    actor: "Priya and her family",
    outcome: "Roaming devices use the same identities, DNS policy and private service names.",
    surfaces: [
      "Native Prism desktop or mobile profile",
      "Encrypted tunnel",
      "Device authorisation",
      "Optional managed relay",
    ],
    actions: [
      "Priya authorises her laptop and phone as roaming devices.",
      "Away from home, the devices connect to her gateway or an optional managed relay.",
      "Private services resolve through the same catalogue.",
      "She revokes a lost tablet from the desktop or web control panel.",
    ],
    benefits: [
      "Policies and private-service access follow device identity rather than location.",
      "A lost device can be revoked centrally.",
      "The managed relay is optional when direct peer-to-peer connectivity works.",
    ],
    costs: [
      "Tunnelling adds battery, latency and support costs.",
      "Mobile operating systems may allow only one active VPN profile.",
      "Home outages affect users who depend on the home gateway as an exit node.",
    ],
    security: [
      "Device keys, not source IP addresses, establish identity.",
      "Relays carry encrypted traffic and do not terminate arbitrary HTTPS.",
      "Exit-node use is separate from private-service access.",
    ],
    features: [
      "Device identity",
      "Encrypted remote access",
      "Optional relay",
      "Remote revocation",
    ],
  },
  {
    short: "Clean pages",
    title: "Priya applies preferences the gateway cannot enforce",
    actor: "Priya and the browser extension",
    outcome: "First-party promotions, paste blocking, cookie interfaces and page redesigns are handled in the browser.",
    surfaces: [
      "Browser-extension policy panel",
      "First-party and community mods",
      "Current-page activity view",
      "Desktop capability inspector",
    ],
    actions: [
      "Priya enables allow-paste, stable-title, reject-consent and no-chatbot policies.",
      "She installs a reviewed YouTube focus mod that removes promotions and Shorts.",
      "The extension applies validated page operations at document start and watches client-side navigation.",
      "The gateway continues handling only its network rules.",
    ],
    benefits: [
      "Prism can address dynamic and first-party anti-features.",
      "Each mod declares page data and network capabilities.",
      "One current-page view explains both browser and Prism-owned network decisions.",
    ],
    costs: [
      "An extension is required in every supported browser.",
      "Site redesigns remain vulnerable to website markup changes.",
      "Browser-store permissions can appear broader than an individual mod's authority.",
    ],
    security: [
      "Native mods receive semantic handles rather than unrestricted JavaScript.",
      "Legacy userscripts remain visibly less trusted.",
      "Credential, cookie and third-party network access are denied by default.",
    ],
    features: [
      "Global behaviour policies",
      "Safe mod runtime",
      "Semantic page capabilities",
      "Cross-layer explanation",
    ],
  },
  {
    short: "Recover",
    title: "Priya fixes a broken video-call site",
    actor: "Priya",
    outcome: "A narrow, temporary exception restores the call without disabling household protection.",
    surfaces: [
      "Current-page explanation panel",
      "Allow-once control",
      "Exact-origin exception editor",
      "Policy conflict detector",
    ],
    actions: [
      "A work video-call site fails because Prism blocked an interaction prompt and a required third-party endpoint.",
      "Priya opens the current-page panel and sees both responsible rules.",
      "She allows the interaction once, confirms the call works, then creates exact-origin exceptions for the required features.",
      "Prism leaves unrelated trackers, mods and household devices unchanged.",
    ],
    benefits: [
      "Users diagnose breakage from outcomes rather than searching several tools.",
      "Exceptions are scoped by origin, feature, mod and duration.",
      "Allow once supports testing before creating a permanent rule.",
    ],
    costs: [
      "Accurate attribution across layers is technically demanding.",
      "Some changes require a reload and cannot be perfectly reversed.",
      "Too many prompts would train users to approve everything.",
    ],
    security: [
      "Hard runtime safety invariants cannot be bypassed by a site exception.",
      "The UI distinguishes a page-mod exception from a network allow rule.",
      "Permanent grants show their expanded information flow before saving.",
    ],
    features: [
      "Unified activity explanation",
      "Allow once",
      "Exact-origin exceptions",
      "Conflict detection",
    ],
  },
  {
    short: "Choose hosting",
    title: "Priya chooses which convenience is worth hosting",
    actor: "Priya",
    outcome: "Local operation remains free while managed services add synchronisation, recovery and relays.",
    surfaces: [
      "Desktop sync and backup settings",
      "Self-hosted controller option",
      "Managed Prism account",
      "Web control panel",
    ],
    actions: [
      "Priya first runs entirely locally and exports an encrypted backup.",
      "She later enables managed sync for family policies and private mods.",
      "Prism encrypts private content before upload and keeps runtime caches local.",
      "She can return to local-only operation without losing installed policies.",
    ],
    benefits: [
      "The subscription pays for coordination, recovery and maintained services rather than mandatory browsing interception.",
      "Self-hosting preserves an exit path.",
      "Cloud outages do not stop installed mods or local gateway policy.",
    ],
    costs: [
      "Cross-device sync requires a transport, whether managed or self-hosted.",
      "Encrypted sync still exposes some account and device metadata.",
      "Key recovery and family administration add product complexity.",
    ],
    security: [
      "Private sync and public publication are separate actions.",
      "Activity and browsing logs do not sync by default.",
      "Devices are individually authorised, encrypted and revocable.",
    ],
    features: [
      "Free local mode",
      "Self-hosting",
      "Managed encrypted sync",
      "Offline runtime caches",
    ],
  },
];

function BulletList({ items }: { items: string[] }) {
  return (
    <Stack gap={6}>
      {items.map((item) => (
        <div key={item}>
          <Row gap={8} align="start">
            <Text as="span" tone="tertiary" style={{ lineHeight: "20px" }}>
              -
            </Text>
            <Text as="span">{item}</Text>
          </Row>
        </div>
      ))}
    </Stack>
  );
}

export default function PriyaHouseholdControlJourney() {
  const theme = useHostTheme();
  const [selected, setSelected] = useCanvasState<number>("priya-household-stage", 0);
  const stage = stages[selected] ?? stages[0];

  return (
    <Stack
      gap={24}
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: 24,
        color: theme.text.primary,
      }}
    >
      <Stack gap={8}>
        <Text size="small" tone="tertiary" weight="semibold">
          PRISM USER JOURNEY
        </Text>
        <H1>Priya unifies household network and browser policy</H1>
        <Text tone="secondary">
          This journey tests Prism as one product with several narrow enforcement points, including the costs that consolidation cannot remove.
        </Text>
      </Stack>

      <Callout tone="info" title="What this story tests">
        Prism should feel like one policy system without claiming that DNS, a native host or a browser extension can replace the other layers.
      </Callout>

      <Stack gap={10}>
        <Text size="small" tone="tertiary" weight="semibold">
          SELECT A STAGE
        </Text>
        <Row gap={8} wrap>
          {stages.map((item, index) => (
            <span key={item.short}>
              <Pill
                active={selected === index}
                onClick={() => setSelected(index)}
              >
                {index + 1}. {item.short}
              </Pill>
            </span>
          ))}
        </Row>
      </Stack>

      <Grid columns="minmax(0, 1.25fr) minmax(300px, 0.75fr)" gap={24} align="start">
        <Stack gap={20}>
          <Card size="lg">
            <CardHeader trailing={<Pill size="sm" active>{stage.actor}</Pill>}>
              {stage.title}
            </CardHeader>
            <CardBody>
              <Stack gap={16}>
                <Text weight="semibold">{stage.outcome}</Text>
                <Divider />
                <H3>What Priya does</H3>
                <BulletList items={stage.actions} />
              </Stack>
            </CardBody>
          </Card>

          <Grid columns={2} gap={20}>
            <Stack gap={8}>
              <H3>Benefits</H3>
              <BulletList items={stage.benefits} />
            </Stack>
            <Stack gap={8}>
              <H3>Costs and limits</H3>
              <BulletList items={stage.costs} />
            </Stack>
          </Grid>
        </Stack>

        <Stack gap={18}>
          <Stack gap={8}>
            <H3>Product surfaces</H3>
            <BulletList items={stage.surfaces} />
          </Stack>

          <Divider />

          <Stack gap={8}>
            <H3>Features exercised</H3>
            <Row gap={6} wrap>
              {stage.features.map((feature) => (
                <span key={feature}>
                  <Pill size="sm">{feature}</Pill>
                </span>
              ))}
            </Row>
          </Stack>

          <Callout tone="warning" title="Security boundary">
            <BulletList items={stage.security} />
          </Callout>
        </Stack>
      </Grid>

      <Divider />

      <Stack gap={16}>
        <H2>What Priya installs</H2>
        <Grid columns={3} gap={12}>
          <Stack
            gap={6}
            style={{
              padding: 12,
              background: theme.fill.tertiary,
              borderRadius: 6,
            }}
          >
            <Text weight="semibold">Native Prism</Text>
            <Text size="small" tone="secondary">
              One installer provides the local service, UI, DNS, routing and gateway capabilities appropriate to the device.
            </Text>
          </Stack>
          <Stack
            gap={6}
            style={{
              padding: 12,
              background: theme.fill.tertiary,
              borderRadius: 6,
            }}
          >
            <Text weight="semibold">Browser extension</Text>
            <Text size="small" tone="secondary">
              Enforces dynamic page behaviour, safe mods, first-party cleanup and browser-specific exceptions.
            </Text>
          </Stack>
          <Stack
            gap={6}
            style={{
              padding: 12,
              background: theme.fill.tertiary,
              borderRadius: 6,
            }}
          >
            <Text weight="semibold">Hosted service, optional</Text>
            <Text size="small" tone="secondary">
              Adds web management, encrypted synchronisation, recovery, managed DNS and optional relays.
            </Text>
          </Stack>
        </Grid>
      </Stack>

      <Callout tone="neutral" title="Centralised UX, separated authority">
        Consolidation improves usability but increases the importance of compartmentalisation. A compromised community mod must not inherit gateway authority, and a compromised hosted account must not become arbitrary code execution on Priya's devices.
      </Callout>
    </Stack>
  );
}
