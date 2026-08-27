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
  movement: string[];
  security: string[];
  prism: string[];
};

const stages: Stage[] = [
  {
    short: "Search",
    title: "Amy searches for a kitten ad replacement",
    actor: "Amy",
    outcome: "No existing marketplace mod matches her idea, so Prism offers a local project template.",
    surfaces: [
      "Marketplace in the web app or desktop app",
      "Public registry search and capability summaries",
      "Create locally action",
    ],
    actions: [
      "Amy searches for kitten, ad replacement and visual ad slots.",
      "Prism returns related mods, but no exact match.",
      "She selects Create locally rather than publishing an empty project.",
    ],
    movement: [
      "Only the search query reaches the public registry.",
      "Browsing history, installed mods and local policies remain local.",
    ],
    security: [
      "Marketplace descriptions are not treated as executable instructions.",
      "Search results display publisher, signature, capabilities and supported sites.",
    ],
    prism: [
      "Offers a semantic ad-slot replacement template.",
      "Explains that replacing an ad visually does not automatically stop its tracking request.",
    ],
  },
  {
    short: "Develop",
    title: "Amy develops and hot-reloads the mod locally",
    actor: "Amy and her chosen AI agent",
    outcome: "An unsigned private draft replaces Prism-detected ad slots with bundled kitten images.",
    surfaces: [
      "Desktop mod editor and local Prism service",
      "Cursor, ChatGPT or another optional authoring agent",
      "Browser extension development channel",
      "Local test activity log",
    ],
    actions: [
      "The desktop app creates a local mod workspace with schema, examples and tests.",
      "Amy or her agent composes the trusted ad-slot and image-replacement primitives.",
      "Saving creates a local revision and notifies the extension through Native Messaging.",
      "Matching open tabs update immediately; failures and false positives appear in the desktop log.",
    ],
    movement: [
      "Draft source, bundled kittens and test results stay on Amy's machine.",
      "If Amy uses a hosted AI, only the files or sanitised DOM sample she explicitly shares leave the device.",
      "The proxy is not used to inject the mod into the page.",
    ],
    security: [
      "Unsigned local mods run only after Amy enables local development.",
      "The browser shows an unsigned local mod indicator.",
      "Bundled images avoid leaking visited sites to an external kitten-image host.",
      "The mod receives ad-slot handles, not unrestricted page text, cookies or network access.",
    ],
    prism: [
      "Provides typed schemas, validation, fixtures and hot reload.",
      "Uses a trusted ad-slot primitive so Amy does not need arbitrary JavaScript.",
      "Lets Amy compare before and after DOM state and undo each replacement.",
    ],
  },
  {
    short: "Keep private",
    title: "Amy privately uses the mod across her devices",
    actor: "Amy",
    outcome: "The mod remains private while Amy's approved devices receive the same revision and settings.",
    surfaces: [
      "Desktop app as the local source of truth",
      "Browser extension cache on each device",
      "Optional paid encrypted sync or self-hosted controller",
      "Manual package export for fully offline use",
    ],
    actions: [
      "Amy marks the draft Active on all sites.",
      "Each extension caches the validated package and applies it at document start.",
      "Paid sync, self-hosting or manual export carries the private package to another device.",
      "The mod continues running from cache while the desktop app or cloud is unavailable.",
    ],
    movement: [
      "Free local mode does not contact Prism servers.",
      "Managed sync uploads an end-to-end encrypted private package only after Amy opts in.",
      "Private sync and public publishing remain separate operations.",
    ],
    security: [
      "Each new device must be authorised and can be revoked.",
      "The all-sites scope is explicit because the requested behaviour is global.",
      "Per-mod capability enforcement prevents the package inheriting Prism's other privileges.",
    ],
    prism: [
      "Supports local-only, self-hosted and managed-sync paths.",
      "Tracks immutable revision hashes so every device runs the intended version.",
      "Reports sites where ad-slot detection appears broken or over-broad.",
    ],
  },
  {
    short: "Publish",
    title: "Amy publishes a reviewed community release",
    actor: "Amy and the Prism registry",
    outcome: "A signed, immutable public release is available without exposing Amy's private history.",
    surfaces: [
      "Desktop publication wizard",
      "Automated package review service",
      "Community registry",
      "Optional human moderation queue",
    ],
    actions: [
      "Amy chooses a name, licence, description, screenshots and supported browser versions.",
      "Prism shows the exact source, assets and capabilities that will become public.",
      "Automated tests scan for secrets, remote resources, deceptive UI and excessive permissions.",
      "After approval, the registry signs an immutable release.",
    ],
    movement: [
      "Only the selected release source, metadata, tests and assets are uploaded.",
      "Local drafts, browsing logs and private settings are excluded.",
    ],
    security: [
      "External image hosts would require a visible network capability and privacy warning.",
      "The release may replace ad presentation but may not click ads, forge rewards or insert affiliate tracking.",
      "Updates create new signed versions; published code is never changed in place.",
    ],
    prism: [
      "Generates a human-readable capability statement.",
      "Runs compatibility and visual-regression tests.",
      "Preserves provenance from Amy's release through registry signature to installation.",
    ],
  },
  {
    short: "Bob installs",
    title: "Bob reviews and installs Amy's community mod",
    actor: "Bob",
    outcome: "Bob grants the narrow capabilities and the signed package runs locally.",
    surfaces: [
      "Marketplace detail page",
      "Desktop app or browser-extension installation prompt",
      "Local Prism service and extension cache",
    ],
    actions: [
      "Bob opens Amy's shared marketplace link.",
      "He reviews screenshots, source, publisher history and the capability summary.",
      "He approves visual ad-slot replacement on all sites.",
      "The signed package is downloaded, validated, cached and activated locally.",
    ],
    movement: [
      "The registry receives the download request.",
      "Page contents and matched ad slots remain on Bob's device.",
      "No request is sent when a bundled kitten image is selected.",
    ],
    security: [
      "Bob must approve all-sites visual modification.",
      "The mod cannot read credentials, cookies, clipboard data or arbitrary page text.",
      "The mod cannot contact Amy or an image service unless Bob separately grants that capability.",
    ],
    prism: [
      "Shows why each capability is needed before installation.",
      "Keeps the registry signature and source available for later inspection.",
      "Provides one-click disable, rollback and report controls.",
    ],
  },
  {
    short: "Optional source",
    title: "Bob enables a third-party kitten source",
    actor: "Bob and the Prism egress broker",
    outcome: "Bob gains a larger image pool without making the mod dependent on the network or granting arbitrary fetch access.",
    surfaces: [
      "Browser-extension mod settings",
      "Desktop capability inspector",
      "Prism egress broker and request activity log",
      "Exact browser host-permission prompt",
    ],
    actions: [
      "The ten bundled kitten images remain the default and offline fallback.",
      "Bob opens the optional source and sees its exact origin, purpose, request fields and unavoidable metadata.",
      "After Bob enables it, Prism requests permission for only the declared HTTPS origin.",
      "Prism fetches through its broker, omits credentials and referrer, validates the image, strips metadata and caches it.",
      "Timeouts, invalid responses or service outages silently return to the bundled pool.",
    ],
    movement: [
      "A direct request exposes Bob's IP address, request time, URL and basic network metadata to the provider.",
      "The current website, page contents, cookies, Prism identity and browsing history are not sent.",
      "Any intentional request field is declared by name, derivation and example value before approval.",
    ],
    security: [
      "The optional connector is disabled by default and the mod remains useful without it.",
      "The mod cannot call fetch or alter the approved request at runtime.",
      "Prism restricts method, origin, redirects, rate, payload fields, response type and response size.",
      "Private addresses, localhost, undeclared redirects, SVG, HTML and executable responses are rejected.",
      "Changing the destination or transmitted fields creates a new signed version and requires renewed consent.",
    ],
    prism: [
      "Separates all-sites visual access from optional third-party network access.",
      "Uses a field-level egress contract rather than a broad network permission.",
      "Distinguishes intentional payloads from unavoidable connection metadata.",
      "Keeps exact requests inspectable without prompting Bob for every image.",
    ],
  },
  {
    short: "Site exception",
    title: "Bob disables kitten replacement for WeirdGame",
    actor: "Bob",
    outcome: "WeirdGame's reward ads work while the kitten mod remains active everywhere else.",
    surfaces: [
      "Browser-extension site panel",
      "Desktop policy editor",
      "Optional cross-device policy sync",
    ],
    actions: [
      "On WeirdGame, Bob opens Prism and selects Kitten Ad Replacement.",
      "He chooses Disable on this site.",
      "Prism removes replacements, restores the original slots and reloads if required.",
      "The origin-scoped exception optionally syncs to Bob's other devices.",
    ],
    movement: [
      "The exception is stored locally first.",
      "It reaches the server only when Bob has enabled managed policy sync.",
    ],
    security: [
      "The exception applies only to WeirdGame's exact origin, not every game site.",
      "Prism checks whether its separate network ad blocker still blocks the reward request.",
      "Bob may create a second site exception for that blocker without allowing unrelated tracking globally.",
      "Prism never clicks ads or fabricates reward completion.",
    ],
    prism: [
      "Explains every active rule affecting the current page.",
      "Detects conflicts between the visual mod and Prism-owned network blocking.",
      "Keeps exceptions per feature and per mod rather than disabling all protection.",
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

export default function AmyKittenModJourney() {
  const theme = useHostTheme();
  const [selected, setSelected] = useCanvasState<number>("amy-kitten-stage", 0);
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
        <H1>From Amy's private kitten mod to Bob's site exception</H1>
        <Text tone="secondary">
          One package moves through local development, private use, publication and installation without gaining more authority than its declared capabilities.
        </Text>
      </Stack>

      <Callout
        tone="info"
        title="Key product decision"
      >
        The mod uses Prism's trusted ad-slot replacement primitive and field-level egress broker. The desktop service owns local state, the browser extension changes pages, and cloud services are optional until Amy explicitly syncs or publishes.
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

      <Grid columns="minmax(0, 1.35fr) minmax(280px, 0.65fr)" gap={24} align="start">
        <Stack gap={20}>
          <Card size="lg">
            <CardHeader trailing={<Pill size="sm" active>{stage.actor}</Pill>}>
              {stage.title}
            </CardHeader>
            <CardBody>
              <Stack gap={16}>
                <Text weight="semibold">{stage.outcome}</Text>
                <Divider />
                <H3>What happens</H3>
                <BulletList items={stage.actions} />
              </Stack>
            </CardBody>
          </Card>

          <Stack gap={8}>
            <H2>How Prism enables it</H2>
            <BulletList items={stage.prism} />
          </Stack>
        </Stack>

        <Stack gap={20}>
          <Stack gap={8}>
            <H3>Product surfaces</H3>
            <BulletList items={stage.surfaces} />
          </Stack>

          <Divider />

          <Stack gap={8}>
            <H3>Data movement</H3>
            <BulletList items={stage.movement} />
          </Stack>

          <Callout tone="warning" title="Security gate">
            <BulletList items={stage.security} />
          </Callout>
        </Stack>
      </Grid>

      <Divider />

      <Stack gap={16}>
        <H2>System ownership throughout the journey</H2>
        <Grid columns={4} gap={12}>
          <Stack
            gap={6}
            style={{
              padding: 12,
              background: theme.fill.tertiary,
              borderRadius: 6,
            }}
          >
            <Text weight="semibold">Desktop service</Text>
            <Text size="small" tone="secondary">
              Owns local drafts, revisions, editing, validation and optional sync.
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
              Applies cached mods, page policies, live reload, egress contracts and site exceptions.
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
            <Text weight="semibold">Gateway</Text>
            <Text size="small" tone="secondary">
              Enforces only declared DNS, firewall or routing rules. This visual mod does not require it.
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
            <Text weight="semibold">Hosted service</Text>
            <Text size="small" tone="secondary">
              Provides registry, signatures and optional encrypted sync. It never executes the mod.
            </Text>
          </Stack>
        </Grid>
      </Stack>

      <Callout tone="neutral" title="Bob's exception is a first-class policy">
        Disabling the kitten mod on WeirdGame does not weaken unrelated protections. If Prism's network blocker also blocks reward ads, Prism identifies that separate rule and asks Bob to create a second origin-scoped exception.
      </Callout>
    </Stack>
  );
}
