/** Components available in every MDX document without importing them. */
import Callout from "../adw/Callout.astro";
import Kbd from "../adw/Kbd.astro";
import Anchor from "./Anchor.astro";
import Checksum from "./Checksum.astro";
import IsoName from "./IsoName.astro";
import Latest from "./Latest.astro";
import Steps from "./Steps.astro";
import Tab from "./Tab.astro";
import Tabs from "./Tabs.astro";
import VerifyCommand from "./VerifyCommand.astro";

export const mdxComponents = {
  Anchor,
  Callout,
  Kbd,
  Checksum,
  IsoName,
  Latest,
  Steps,
  Tab,
  Tabs,
  VerifyCommand,
};
